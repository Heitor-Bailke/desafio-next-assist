import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserFromRequest } from "../../../lib/auth";
import { database } from "../../../lib/database";
import { transitionConversation } from "../../../lib/conversations";

const actionSchema = z.object({
  conversationId: z.string().min(1),
  action: z.enum(["take", "return", "close", "reply"]),
  content: z.string().trim().min(1).max(4000).optional(),
});

type ConversationRow = { id: string; userId: string; userName: string; userEmail: string; status: string; analystId: string | null; updatedAt: string };
type MessageRow = { id: string; author: string; content: string; createdAt: string };
type TicketRow = { number: string; title: string; status: string; priority: string; category: string; nextUpdateDueAt: string };

const analystOnly = (request: Request) => {
  const user = getUserFromRequest(request);
  return user?.role === "analyst" ? user : null;
};

const listConversations = (): ConversationRow[] => database.prepare(`
  SELECT conversations.id, conversations.user_id AS userId, users.name AS userName, users.email AS userEmail,
    conversations.status, conversations.analyst_id AS analystId, conversations.updated_at AS updatedAt
  FROM conversations JOIN users ON users.id = conversations.user_id
  WHERE conversations.status != 'closed' ORDER BY conversations.updated_at DESC
`).all() as ConversationRow[];

const detail = (conversationId: string) => {
  const conversation = database.prepare(`
    SELECT conversations.id, conversations.user_id AS userId, users.name AS userName, users.email AS userEmail,
      conversations.status, conversations.analyst_id AS analystId, conversations.updated_at AS updatedAt
    FROM conversations JOIN users ON users.id = conversations.user_id WHERE conversations.id = ?
  `).get(conversationId) as ConversationRow | undefined;
  if (!conversation) return null;
  const messages = database.prepare("SELECT id, author, content, created_at AS createdAt FROM messages WHERE conversation_id = ? ORDER BY session_message_number").all(conversationId) as MessageRow[];
  const tickets = database.prepare("SELECT number, title, status, priority, category, next_update_due_at AS nextUpdateDueAt FROM tickets WHERE requester_id = ? ORDER BY created_at DESC").all(conversation.userId) as TicketRow[];
  return { conversation, messages, tickets };
};

export function GET(request: Request): NextResponse {
  if (!analystOnly(request)) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  const conversationId = new URL(request.url).searchParams.get("conversationId");
  return NextResponse.json(conversationId ? detail(conversationId) : { conversations: listConversations() });
}

export async function POST(request: Request): Promise<NextResponse> {
  const analyst = analystOnly(request);
  if (!analyst) return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
  try {
    const input = actionSchema.parse(await request.json());
    const current = database.prepare("SELECT status FROM conversations WHERE id = ?").get(input.conversationId) as { status: string } | undefined;
    if (!current) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });
    transitionConversation(current.status as "agent" | "waiting_analyst" | "with_analyst" | "closed", input.action);
    if (input.action === "take") database.prepare("UPDATE conversations SET status = 'with_analyst', analyst_id = ?, updated_at = ? WHERE id = ?").run(analyst.id, new Date().toISOString(), input.conversationId);
    if (input.action === "return") database.prepare("UPDATE conversations SET status = 'agent', analyst_id = NULL, updated_at = ? WHERE id = ?").run(new Date().toISOString(), input.conversationId);
    if (input.action === "close") database.prepare("UPDATE conversations SET status = 'closed', updated_at = ? WHERE id = ?").run(new Date().toISOString(), input.conversationId);
    if (input.action === "reply") {
      if (current.status !== "with_analyst") return NextResponse.json({ error: "Assuma a conversa antes de responder." }, { status: 409 });
      const count = database.prepare("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?").get(input.conversationId) as { count: number };
      database.prepare("INSERT INTO messages (id, conversation_id, author, content, created_at, session_message_number) VALUES (?, ?, 'analyst', ?, ?, ?)").run(
        `message-${crypto.randomUUID()}`, input.conversationId, input.content, new Date().toISOString(), count.count + 1,
      );
      database.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), input.conversationId);
    }
    return NextResponse.json(detail(input.conversationId));
  } catch (error: unknown) {
    return NextResponse.json({ error: error instanceof z.ZodError ? "Ação inválida." : "Não foi possível executar a ação." }, { status: 400 });
  }
}