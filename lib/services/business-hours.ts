import type { TicketPriority } from "../domain";

const OPEN_HOUR_UTC = 8;
const CLOSE_HOUR_UTC = 18;
const BUSINESS_MINUTES_PER_DAY = (CLOSE_HOUR_UTC - OPEN_HOUR_UTC) * 60;

const isBusinessDay = (date: Date): boolean => {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5;
};

const nextBusinessStart = (date: Date): Date => {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(OPEN_HOUR_UTC, 0, 0, 0);

  while (!isBusinessDay(next)) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
};

const normalizeToBusinessStart = (date: Date): Date => {
  const normalized = new Date(date);

  if (!isBusinessDay(normalized)) {
    normalized.setUTCHours(OPEN_HOUR_UTC, 0, 0, 0);
    while (!isBusinessDay(normalized)) {
      normalized.setUTCDate(normalized.getUTCDate() + 1);
    }
    return normalized;
  }

  const hour = normalized.getUTCHours();
  if (hour < OPEN_HOUR_UTC) {
    normalized.setUTCHours(OPEN_HOUR_UTC, 0, 0, 0);
  } else if (hour >= CLOSE_HOUR_UTC) {
    return nextBusinessStart(normalized);
  }

  return normalized;
};

export const businessHoursForPriority = (priority: TicketPriority): number => {
  switch (priority) {
    case "Crítica":
      return 1;
    case "Alta":
      return 4;
    case "Média":
      return BUSINESS_MINUTES_PER_DAY / 60 * 3;
    case "Baixa":
      return BUSINESS_MINUTES_PER_DAY / 60 * 5;
  }
};

export const addBusinessHours = (start: Date, hours: number): Date => {
  if (hours < 0) {
    throw new Error("A quantidade de horas úteis não pode ser negativa.");
  }

  let cursor = normalizeToBusinessStart(start);
  let remainingMinutes = hours * 60;

  while (remainingMinutes > 0) {
    const close = new Date(cursor);
    close.setUTCHours(CLOSE_HOUR_UTC, 0, 0, 0);
    const availableMinutes = (close.getTime() - cursor.getTime()) / 60000;

    if (remainingMinutes <= availableMinutes) {
      return new Date(cursor.getTime() + remainingMinutes * 60000);
    }

    remainingMinutes -= availableMinutes;
    cursor = nextBusinessStart(cursor);
  }

  return cursor;
};

export const isOverdue = (dueAt: Date, now: Date = new Date()): boolean => now.getTime() > dueAt.getTime();