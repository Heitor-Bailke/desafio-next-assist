import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createNexoAgent } from "../lib/agent/nexo-agent";
import { createDecisionContext, persistDecisionTrace } from "../lib/agent/trace";
import { createDatabase } from "../lib/database";
import { SqliteHelpCenterService } from "../lib/services/help-center";
import { LegacyTicketingAdapter } from "../lib/services/legacy-ticketing";
import { SqliteTicketingService } from "../lib/services/ticketing";

describe("Nexo Assist agent", () => {
  let database: Database.Database;

  beforeEach(() => {
    database = createDatabase(":memory:");
    database.prepare("INSERT INTO users (id, email, name, role, created_at) VALUES (?, ?, ?, ?, ?)").run(
      "user-ana", "ana.silva@nexo.com", "Ana Silva", "employee", "2026-11-01T08:00:00.000Z",
    );
    database.prepare("INSERT INTO conversations (id, user_id, status, created_at, updated_at) VALUES (?, ?, 'agent', ?, ?)").run(
      "conversation-1", "user-ana", "2026-11-16T08:00:00.000Z", "2026-11-16T08:00:00.000Z",
    );
  });

  afterEach(() => database.close());

  it("wires the Mastra agent to the complete tool set", async () => {
    const ticketing = new LegacyTicketingAdapter(new SqliteTicketingService(database), {
      failureRate: 0,
      random: () => 1,
    });
    const agent = createNexoAgent({
      requesterId: "user-ana",
      ticketing,
      helpCenter: new SqliteHelpCenterService(database),
      transfer: () => undefined,
    });

    expect(Object.keys(await agent.listTools())).toEqual([
      "searchHelpCenter",
      "listMyTickets",
      "getMyTicket",
      "checkDuplicateTicket",
      "createTicket",
      "updateTicket",
      "reopenTicket",
      "transferToAnalyst",
    ]);
  });

  it("persists a decision trace and summarized tool calls", () => {
    const decision = createDecisionContext();
    decision.intent = "consulta de chamados";
    decision.action = "consultou os chamados do funcionário";
    decision.confidence = 0.98;
    decision.rationale = "A busca foi restringida ao usuário da sessão.";
    decision.toolCalls.push({
      toolName: "listMyTickets",
      inputSummary: "{}",
      outputSummary: '{"tickets":[]}',
    });

    database.prepare("INSERT INTO messages (id, conversation_id, author, content, created_at, session_message_number) VALUES (?, ?, 'agent', ?, ?, ?)").run(
      "message-1", "conversation-1", "Você não possui chamados abertos.", "2026-11-16T08:01:00.000Z", 2,
    );
    persistDecisionTrace(database, "message-1", decision);

    const trace = database.prepare("SELECT intent, action, confidence, rationale FROM decision_traces WHERE message_id = ?").get("message-1") as {
      intent: string;
      action: string;
      confidence: number;
      rationale: string;
    };
    const toolCall = database.prepare("SELECT tool_name, input_summary, output_summary FROM tool_calls WHERE trace_id = ?").get("trace-message-1") as {
      tool_name: string;
      input_summary: string;
      output_summary: string;
    };

    expect(trace).toEqual({
      intent: "consulta de chamados",
      action: "consultou os chamados do funcionário",
      confidence: 0.98,
      rationale: "A busca foi restringida ao usuário da sessão.",
    });
    expect(toolCall).toEqual({
      tool_name: "listMyTickets",
      input_summary: "{}",
      output_summary: '{"tickets":[]}',
    });
  });
});