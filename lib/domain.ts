import { z } from "zod";

export const ticketTypeSchema = z.enum(["INC", "REQ"]);
export type TicketType = z.infer<typeof ticketTypeSchema>;

export const ticketCategorySchema = z.enum([
  "Acesso",
  "Rede e VPN",
  "Hardware",
  "Software",
  "E-mail",
  "Outros",
]);
export type TicketCategory = z.infer<typeof ticketCategorySchema>;

export const ticketPrioritySchema = z.enum(["Crítica", "Alta", "Média", "Baixa"]);
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;

export const ticketStatusSchema = z.enum([
  "Aberto",
  "Aguardando analista",
  "Em atendimento",
  "Aprovado",
  "Resolvido",
  "Encerrado",
]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const conversationStatusSchema = z.enum([
  "agent",
  "waiting_analyst",
  "with_analyst",
  "closed",
]);
export type ConversationStatus = z.infer<typeof conversationStatusSchema>;

export const ticketDraftSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  type: ticketTypeSchema,
  category: ticketCategorySchema,
  priority: ticketPrioritySchema,
  affectedPeople: z.number().int().min(1),
});
export type TicketDraft = z.infer<typeof ticketDraftSchema>;