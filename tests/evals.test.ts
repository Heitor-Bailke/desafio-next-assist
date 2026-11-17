import { describe, expect, it } from "vitest";
import { classifyRequest } from "../lib/agent/policy";

const cases = [
  { input: "Meu acesso à VPN caiu", intent: "ti", minimumConfidence: 0.8 },
  { input: "Preciso falar sobre meu salário", intent: "fora_do_escopo", minimumConfidence: 0.9 },
  { input: "Não está funcionando", intent: "incerta", minimumConfidence: 0.2 },
] as const;

describe("agent policy evals", () => {
  for (const testCase of cases) {
    it(`classifica: ${testCase.input}`, () => {
      const result = classifyRequest(testCase.input);
      expect(result.intent).toBe(testCase.intent);
      expect(result.confidence).toBeGreaterThanOrEqual(testCase.minimumConfidence);
    });
  }
});