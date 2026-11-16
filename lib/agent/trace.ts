import type Database from "better-sqlite3";

export type ToolCallTrace = {
  toolName: string;
  inputSummary: string;
  outputSummary: string;
};

export type DecisionContext = {
  intent: string;
  action: string;
  confidence: number;
  rationale: string;
  toolCalls: ToolCallTrace[];
  transferred: boolean;
};

export const createDecisionContext = (): DecisionContext => ({
  intent: "atendimento de TI",
  action: "analisou a solicitação",
  confidence: 0.5,
  rationale: "A decisão ainda está sendo analisada.",
  toolCalls: [],
  transferred: false,
});

const summarize = (value: unknown): string => {
  const serialized = JSON.stringify(value);
  return serialized.length > 500 ? `${serialized.slice(0, 497)}...` : serialized;
};

export const recordToolCall = (
  context: DecisionContext,
  toolName: string,
  input: unknown,
  output: unknown,
): void => {
  context.toolCalls.push({
    toolName,
    inputSummary: summarize(input),
    outputSummary: summarize(output),
  });
};

export const persistDecisionTrace = (
  database: Database.Database,
  messageId: string,
  context: DecisionContext,
): void => {
  const traceId = `trace-${messageId}`;
  const createdAt = new Date().toISOString();
  database.prepare(`
    INSERT INTO decision_traces (id, message_id, intent, action, confidence, rationale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(traceId, messageId, context.intent, context.action, context.confidence, context.rationale, createdAt);

  const insertToolCall = database.prepare(`
    INSERT INTO tool_calls (id, trace_id, tool_name, input_summary, output_summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (const [index, call] of context.toolCalls.entries()) {
    insertToolCall.run(
      `${traceId}-tool-${index + 1}`,
      traceId,
      call.toolName,
      call.inputSummary,
      call.outputSummary,
      createdAt,
    );
  }
};