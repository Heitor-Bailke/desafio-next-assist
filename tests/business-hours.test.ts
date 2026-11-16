import { describe, expect, it } from "vitest";
import { addBusinessHours, businessHoursForPriority, isOverdue } from "../lib/services/business-hours";

describe("business hours", () => {
  it("maps priorities to the defined service windows", () => {
    expect(businessHoursForPriority("Crítica")).toBe(1);
    expect(businessHoursForPriority("Alta")).toBe(4);
    expect(businessHoursForPriority("Média")).toBe(30);
    expect(businessHoursForPriority("Baixa")).toBe(50);
  });

  it("does not count weekends or time outside the service desk", () => {
    const fridayAtFive = new Date("2026-11-20T17:00:00.000Z");
    expect(addBusinessHours(fridayAtFive, 2).toISOString()).toBe("2026-11-23T09:00:00.000Z");
  });

  it("marks a deadline as overdue only after it passes", () => {
    const dueAt = new Date("2026-11-16T12:00:00.000Z");
    expect(isOverdue(dueAt, new Date("2026-11-16T12:00:00.000Z"))).toBe(false);
    expect(isOverdue(dueAt, new Date("2026-11-16T12:00:01.000Z"))).toBe(true);
  });
});