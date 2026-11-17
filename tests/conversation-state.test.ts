import { describe, expect, it } from "vitest";
import { transitionConversation } from "../lib/conversations";

describe("conversation state machine", () => {
  it("allows an analyst to take, return and close a conversation", () => {
    expect(transitionConversation("waiting_analyst", "take")).toBe("with_analyst");
    expect(transitionConversation("with_analyst", "return")).toBe("agent");
    expect(transitionConversation("with_analyst", "close")).toBe("closed");
  });

  it("rejects actions from an invalid state", () => {
    expect(() => transitionConversation("agent", "close")).toThrow("Transição inválida");
    expect(() => transitionConversation("waiting_analyst", "reply")).toThrow("Transição inválida");
  });
});