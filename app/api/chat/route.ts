import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "../../../lib/auth";
import { runNexoAgentTurn, AgentTurnError } from "../../../lib/agent/nexo-agent";
import { getOrCreateConversation } from "../../../lib/conversations";
import { database } from "../../../lib/database";
import { SqliteHelpCenterService } from "../../../lib/services/help-center";
import { LegacyTicketingAdapter } from "../../../lib/services/legacy-ticketing";
import { SqliteTicketingService } from "../../../lib/services/ticketing";

const messageSchema = z.object({ content: z.string().trim().min(1).max(4000) });
const services = () => ({
  ticketing: new LegacyTicketingAdapter(new SqliteTicketingService(database)),
  helpCenter: new SqliteHelpCenterService(database),
});

const readConversation = (userId: string) => {
  const conversationId = getOrCreateConversation(database, userId);
  const messages = database.prepare(`
    SELECT messages.id, messages.author, messages.content, messages.created_at AS createdAt,
      decision_traces.intent, decision_traces.action, decision_traces.confidence,
      decision_traces.rationale
    FROM messages LEFT JOIN decision_traces ON decision_traces.message_id = messages.id
    WHERE messages.conversation_id = ? ORDER BY messages.session_message_number ASC
  `).all(conversationId);
  const conversation = database.prepare("SELECT id, status, updated_at AS updatedAt FROM conversations WHERE id = ?").get(conversationId);
  const tickets = new SqliteTicketingService(database).listMyTickets(userId);
  return { conversation, messages, tickets };
};

export function GET(request: Request): NextResponse {
  const user = getUserFromRequest(request);
  if (!user || user.role !== "employee") {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }
  return NextResponse.json(readConversation(user.id));
}

export async function POST(request: Request): Promise<Response> {
  const user = getUserFromRequest(request);
  if (!user || user.role !== "employee") {
    return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  }

  try {
    const input = messageSchema.parse(await request.json());
    const conversationId = getOrCreateConversation(database, user.id);
    const result = await runNexoAgentTurn({
      database,
      conversationId,
      requesterId: user.id,
      content: input.content,
      ...services(),
    });
    const encoder = new TextEncoder();
    const text = result.assistantMessage ?? "";
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const word of text.split(/(?<=\s)/u)) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: "text", value: word })}\n`));
          await new Promise<void>((resolve) => setTimeout(resolve, 12));
        }
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: "trace", value: result.decision, messageId: result.messageId })}\n`));
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" } });
  } catch (error: unknown) {
    const status = error instanceof AgentTurnError && error.code === "MESSAGE_LIMIT" ? 429 : error instanceof AgentTurnError ? 409 : 400;
    const message = error instanceof AgentTurnError && error.code === "MESSAGE_LIMIT" ? "Esta sessão atingiu o limite de 30 mensagens." : "Não foi possível processar a mensagem.";
    return NextResponse.json({ error: message }, { status });
  }
}