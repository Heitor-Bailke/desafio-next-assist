import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { ticketDraftSchema } from "../domain";
import type { SqliteHelpCenterService } from "../services/help-center";
import { LegacyTicketingAdapter } from "../services/legacy-ticketing";
import { TicketingError } from "../services/ticketing";
import type { DecisionContext } from "./trace";
import { recordToolCall } from "./trace";

const ticketSchema = z.object({
  id: z.string(), number: z.string(), requesterId: z.string(), title: z.string(), description: z.string(),
  type: z.enum(["INC", "REQ"]), category: z.string(), priority: z.string(), affectedPeople: z.number(),
  status: z.string(), firstResponseDueAt: z.string(), nextUpdateDueAt: z.string(),
  resolvedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});

const toolResult = <T>(context: DecisionContext, name: string, input: unknown, output: T): T => {
  recordToolCall(context, name, input, output);
  return output;
};

export type NexoToolDependencies = {
  requesterId: string;
  ticketing: LegacyTicketingAdapter;
  helpCenter: SqliteHelpCenterService;
  decision: DecisionContext;
  transfer: (summary: string) => Promise<void> | void;
};

export const createNexoTools = (dependencies: NexoToolDependencies) => {
  const { requesterId, ticketing, helpCenter, decision, transfer } = dependencies;

  const searchHelpCenter = createTool({
    id: "search-help-center",
    description: "Busca artigos curtos da central de ajuda de TI antes de executar ações mais caras.",
    inputSchema: z.object({ query: z.string().min(2).max(200) }),
    outputSchema: z.object({ articles: z.array(z.object({ id: z.string(), title: z.string(), content: z.string(), keywords: z.array(z.string()) })) }),
    execute: async ({ query }) => {
      const output = { articles: helpCenter.search(query) };
      decision.intent = "dúvida ou problema de TI";
      decision.action = "consultou a central de ajuda";
      decision.confidence = output.articles.length > 0 ? 0.9 : 0.6;
      decision.rationale = output.articles.length > 0 ? "Encontrou conteúdo compatível na central." : "Não encontrou artigo específico e precisa coletar mais contexto.";
      return toolResult(decision, "searchHelpCenter", { query }, output);
    },
  });

  const listMyTickets = createTool({
    id: "list-my-tickets",
    description: "Lista somente os chamados do funcionário autenticado, sem aceitar outro e-mail do texto.",
    inputSchema: z.object({}),
    outputSchema: z.object({ tickets: z.array(ticketSchema) }),
    execute: async () => {
      const output = { tickets: await ticketing.listMyTickets(requesterId) };
      decision.intent = "consulta de chamados";
      decision.action = "consultou os chamados do funcionário";
      decision.confidence = 0.98;
      decision.rationale = "A busca foi restringida ao usuário da sessão.";
      return toolResult(decision, "listMyTickets", {}, output);
    },
  });

  const getMyTicket = createTool({
    id: "get-my-ticket",
    description: "Consulta um chamado pelo número, validando que ele pertence ao funcionário autenticado.",
    inputSchema: z.object({ ticketNumber: z.string().regex(/^(INC|REQ)-\d+$/) }),
    outputSchema: z.object({ ticket: ticketSchema }),
    execute: async ({ ticketNumber }) => {
      const output = { ticket: await ticketing.getMyTicket(requesterId, ticketNumber) };
      decision.intent = "consulta de chamado";
      decision.action = "consultou o chamado solicitado";
      decision.confidence = 0.98;
      decision.rationale = "O serviço validou a propriedade do chamado pela sessão.";
      return toolResult(decision, "getMyTicket", { ticketNumber }, output);
    },
  });

  const checkDuplicateTicket = createTool({
    id: "check-duplicate-ticket",
    description: "Verifica se já existe chamado aberto sobre o mesmo problema antes de criar outro.",
    inputSchema: ticketDraftSchema,
    outputSchema: z.object({ duplicate: ticketSchema.nullable() }),
    execute: async (draft) => {
      const output = { duplicate: await ticketing.findOpenDuplicate(requesterId, draft) };
      decision.action = output.duplicate ? "encontrou chamado aberto semelhante" : "verificou duplicidade e não encontrou chamado semelhante";
      decision.confidence = 0.98;
      decision.rationale = output.duplicate ? "O título e o tipo coincidem com um chamado aberto do mesmo funcionário." : "A busca foi feita antes de qualquer criação.";
      return toolResult(decision, "checkDuplicateTicket", draft, output);
    },
  });

  const createTicket = createTool({
    id: "create-ticket",
    description: "Cria um chamado somente quando todos os campos estão preenchidos e o funcionário confirmou o rascunho.",
    inputSchema: ticketDraftSchema.extend({ confirmed: z.boolean() }),
    outputSchema: z.object({ status: z.enum(["created", "confirmation_required", "duplicate"]), ticket: ticketSchema.nullable(), message: z.string() }),
    execute: async ({ confirmed, ...draft }) => {
      if (!confirmed) {
        const output = { status: "confirmation_required" as const, ticket: null, message: "Mostre o rascunho e aguarde confirmação explícita." };
        decision.action = "preparou rascunho para confirmação";
        decision.confidence = 0.95;
        decision.rationale = "A criação foi bloqueada porque não houve confirmação explícita.";
        return toolResult(decision, "createTicket", { ...draft, confirmed }, output);
      }
      try {
        const output = { status: "created" as const, ticket: await ticketing.createTicket(requesterId, draft), message: "Chamado criado." };
        if (draft.priority === "Crítica") {
          await transfer(`Chamado crítico ${output.ticket.number}: ${output.ticket.title}`);
          decision.transferred = true;
          decision.action = "criou o chamado crítico e transferiu a conversa";
          decision.rationale = "Casos críticos exigem atendimento de analista e plantão 24h.";
        } else {
          decision.action = "criou o chamado após confirmação";
          decision.rationale = "Todos os campos obrigatórios foram validados e não havia duplicidade aberta.";
        }
        decision.confidence = 0.98;
        return toolResult(decision, "createTicket", { ...draft, confirmed }, output);
      } catch (error: unknown) {
        if (error instanceof TicketingError && error.code === "DUPLICATE") {
          const output = { status: "duplicate" as const, ticket: null, message: "Já existe um chamado aberto semelhante; atualize-o em vez de duplicar." };
          decision.action = "bloqueou uma duplicidade";
          decision.confidence = 0.99;
          decision.rationale = "O serviço de chamados recusou a criação duplicada.";
          return toolResult(decision, "createTicket", { ...draft, confirmed }, output);
        }
        throw error;
      }
    },
  });

  const updateTicket = createTool({
    id: "update-ticket",
    description: "Atualiza um chamado próprio existente, sempre usando o número informado pelo funcionário.",
    inputSchema: z.object({ ticketNumber: z.string().regex(/^(INC|REQ)-\d+$/), update: z.record(z.string(), z.unknown()) }),
    outputSchema: z.object({ ticket: ticketSchema }),
    execute: async ({ ticketNumber, update }) => {
      const output = { ticket: await ticketing.updateTicket(requesterId, ticketNumber, update) };
      decision.action = "atualizou o chamado";
      decision.confidence = 0.96;
      decision.rationale = "A atualização passou pela validação de propriedade do serviço.";
      return toolResult(decision, "updateTicket", { ticketNumber, update }, output);
    },
  });

  const reopenTicket = createTool({
    id: "reopen-ticket",
    description: "Reabre chamado próprio resolvido há no máximo 7 dias.",
    inputSchema: z.object({ ticketNumber: z.string().regex(/^(INC|REQ)-\d+$/) }),
    outputSchema: z.object({ ticket: ticketSchema }),
    execute: async ({ ticketNumber }) => {
      const output = { ticket: await ticketing.reopenTicket(requesterId, ticketNumber) };
      decision.action = "reabriu o chamado";
      decision.confidence = 0.97;
      decision.rationale = "O serviço confirmou que a resolução ocorreu dentro da janela de 7 dias.";
      return toolResult(decision, "reopenTicket", { ticketNumber }, output);
    },
  });

  const transferToAnalyst = createTool({
    id: "transfer-to-analyst",
    description: "Transfere a conversa quando o funcionário pede, o caso é crítico, está vencido ou há baixa confiança.",
    inputSchema: z.object({ reason: z.string().min(3), summary: z.string().min(10) }),
    outputSchema: z.object({ transferred: z.boolean(), message: z.string() }),
    execute: async ({ reason, summary }) => {
      await transfer(summary);
      decision.transferred = true;
      const output = { transferred: true, message: "Conversa transferida para um analista." };
      decision.action = "transferiu a conversa para um analista";
      decision.confidence = Math.min(decision.confidence, 0.4);
      decision.rationale = `Transferência solicitada por: ${reason}.`;
      return toolResult(decision, "transferToAnalyst", { reason, summary }, output);
    },
  });

  return { searchHelpCenter, listMyTickets, getMyTicket, checkDuplicateTicket, createTicket, updateTicket, reopenTicket, transferToAnalyst };
};