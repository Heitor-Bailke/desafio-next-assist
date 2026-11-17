import { Agent } from "@mastra/core/agent";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { createDecisionContext, persistDecisionTrace, type DecisionContext } from "./trace";
import { classifyRequest } from "./policy";
import { createNexoTools, type NexoToolDependencies } from "./tools";
import type { SqliteHelpCenterService } from "../services/help-center";
import { LegacyTicketingAdapter } from "../services/legacy-ticketing";

const MAX_MESSAGES_PER_SESSION = 30;

const instructions = `
Você é o Nexo Assist, agente de service desk de TI da Nexo.

Regras obrigatórias:
- Atenda somente assuntos de TI. RH, financeiro e facilities devem ser redirecionados com educação.
- Consulte a central de ajuda antes de chamar tools de chamados quando a mensagem puder ser resolvida por artigo.
- Para abrir ou atualizar um chamado, obtenha título, descrição, tipo INC ou REQ, categoria, prioridade e quem é afetado.
- A prioridade depende de impacto e urgência. Não invente prazos; eles vêm das tools.
- Sempre verifique duplicidade antes de criar. Mostre o rascunho e peça confirmação explícita.
- Nunca peça nem aceite e-mail para trocar o usuário autenticado.
- Transfira quando a pessoa pedir, o caso for crítico, o chamado estiver vencido ou sua segurança for baixa.
- Depois de transferir, não execute mais ações nem tente responder ao funcionário.
- Seja direto, explique as ações executadas antes da resposta e nunca invente dados.
`;

export type NexoAgentDependencies = Omit<NexoToolDependencies, "decision"> & {
  decision?: DecisionContext;
};

export const createNexoAgent = (dependencies: NexoAgentDependencies): Agent => {
  const decision = dependencies.decision ?? createDecisionContext();
  return new Agent({
    id: "nexo-assist-agent",
    name: "Nexo Assist",
    instructions,
    model: process.env.LLM_MODEL ?? "openai/gpt-4o-mini",
    tools: createNexoTools({ ...dependencies, decision }),
    maxRetries: 1,
  });
};

type ConversationRow = {
  user_id: string;
  status: "agent" | "waiting_analyst" | "with_analyst" | "closed";
};

export type AgentTurnInput = {
  database: Database.Database;
  conversationId: string;
  requesterId: string;
  content: string;
  ticketing: LegacyTicketingAdapter;
  helpCenter: SqliteHelpCenterService;
};

export type AgentTurnResult = {
  assistantMessage: string | null;
  messageId: string;
  decision: DecisionContext;
};

export class AgentTurnError extends Error {
  public constructor(public readonly code: "CONVERSATION_NOT_FOUND" | "PAUSED" | "MESSAGE_LIMIT") {
    super(code);
    this.name = "AgentTurnError";
  }
}

export const runNexoAgentTurn = async ({
  database,
  conversationId,
  requesterId,
  content,
  ticketing,
  helpCenter,
}: AgentTurnInput): Promise<AgentTurnResult> => {
  const conversation = database.prepare("SELECT user_id, status FROM conversations WHERE id = ?").get(conversationId) as ConversationRow | undefined;
  if (!conversation || conversation.user_id !== requesterId) {
    throw new AgentTurnError("CONVERSATION_NOT_FOUND");
  }
  if (conversation.status !== "agent") {
    throw new AgentTurnError("PAUSED");
  }

  const messageCount = database.prepare("SELECT COUNT(*) AS count FROM messages WHERE conversation_id = ?").get(conversationId) as { count: number };
  if (messageCount.count >= MAX_MESSAGES_PER_SESSION) {
    throw new AgentTurnError("MESSAGE_LIMIT");
  }

  const now = new Date().toISOString();
  const userMessageId = `message-${randomUUID()}`;
  const userMessageNumber = messageCount.count + 1;
  database.prepare(`
    INSERT INTO messages (id, conversation_id, author, content, created_at, session_message_number)
    VALUES (?, ?, 'employee', ?, ?, ?)
  `).run(userMessageId, conversationId, content, now, userMessageNumber);

  const decision = createDecisionContext();
  const policy = classifyRequest(content);
  if (policy.intent === "fora_do_escopo") {
    decision.intent = policy.intent;
    decision.action = "redirecionou para o canal responsável";
    decision.confidence = policy.confidence;
    decision.rationale = "A mensagem não pertence ao escopo de TI.";
    const assistantMessageId = `message-${randomUUID()}`;
    database.prepare("INSERT INTO messages (id, conversation_id, author, content, created_at, session_message_number) VALUES (?, ?, 'agent', ?, ?, ?)").run(
      assistantMessageId, conversationId, policy.response, new Date().toISOString(), userMessageNumber + 1,
    );
    persistDecisionTrace(database, assistantMessageId, decision);
    return { assistantMessage: policy.response ?? "", messageId: assistantMessageId, decision };
  }
  const agent = createNexoAgent({
    requesterId,
    ticketing,
    helpCenter,
    decision,
    transfer: () => {
      database.prepare("UPDATE conversations SET status = 'waiting_analyst', updated_at = ? WHERE id = ?").run(new Date().toISOString(), conversationId);
    },
  });

  let assistantMessage: string | null;
  try {
    const result = await agent.generate(content, {
      maxSteps: 6,
      modelSettings: { temperature: 0.1, maxOutputTokens: 500 },
    });
    if (!decision.transferred && decision.confidence <= 0.5) {
      database.prepare("UPDATE conversations SET status = 'waiting_analyst', updated_at = ? WHERE id = ?").run(new Date().toISOString(), conversationId);
      decision.transferred = true;
      decision.action = "transferiu a conversa por baixa confiança";
      decision.rationale = "O agent não atingiu confiança suficiente para responder com segurança.";
    }
    assistantMessage = decision.transferred ? null : result.text;
    decision.rationale = decision.transferred ? "A conversa foi transferida e o agent foi pausado." : decision.rationale;
  } catch (error: unknown) {
    decision.action = "informou uma falha sem inventar resultado";
    decision.confidence = 0.1;
    decision.rationale = error instanceof Error ? error.message : "Falha desconhecida ao consultar o modelo.";
    assistantMessage = "Não consegui concluir esta solicitação agora. A tentativa foi registrada e um analista poderá continuar o atendimento.";
  }

  if (assistantMessage === null) {
    persistDecisionTrace(database, userMessageId, decision);
    return { assistantMessage, messageId: userMessageId, decision };
  }

  const assistantMessageId = `message-${randomUUID()}`;
  database.prepare(`
    INSERT INTO messages (id, conversation_id, author, content, created_at, session_message_number)
    VALUES (?, ?, 'agent', ?, ?, ?)
  `).run(assistantMessageId, conversationId, assistantMessage, new Date().toISOString(), userMessageNumber + 1);
  persistDecisionTrace(database, assistantMessageId, decision);
  database.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").run(new Date().toISOString(), conversationId);
  return { assistantMessage, messageId: assistantMessageId, decision };
};