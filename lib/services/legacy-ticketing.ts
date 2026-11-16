import type { TicketDraft } from "../domain";
import type { TicketRecord, TicketingService } from "./ticketing";

export type LegacyRetryOptions = {
  maxAttempts?: number;
  timeoutMs?: number;
  backoffMs?: number;
  failureRate?: number;
  failureDelayMs?: number;
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class LegacyUnavailableError extends Error {
  public constructor(message = "O serviço de chamados está temporariamente indisponível. Tente novamente em instantes.") {
    super(message);
    this.name = "LegacyUnavailableError";
  }
}

const defaultSleep = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

export const withLegacyRetry = async <T>(
  operation: () => Promise<T>,
  options: LegacyRetryOptions = {},
): Promise<T> => {
  const maxAttempts = options.maxAttempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 2500;
  const backoffMs = options.backoffMs ?? 150;
  const sleep = options.sleep ?? defaultSleep;
  let lastError: unknown = new LegacyUnavailableError();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new LegacyUnavailableError("O serviço de chamados excedeu o tempo limite.")), timeoutMs);
        }),
      ]);
      return result;
    } catch (error: unknown) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      await sleep(backoffMs * 2 ** (attempt - 1));
    }
  }

  if (lastError instanceof LegacyUnavailableError) {
    throw lastError;
  }
  throw new LegacyUnavailableError();
};

export class LegacyTicketingAdapter {
  private readonly options: LegacyRetryOptions;

  public constructor(private readonly service: TicketingService, options: LegacyRetryOptions = {}) {
    this.options = options;
  }

  public listMyTickets(requesterId: string): Promise<TicketRecord[]> {
    return this.request(() => this.service.listMyTickets(requesterId));
  }

  public getMyTicket(requesterId: string, ticketNumber: string): Promise<TicketRecord> {
    return this.request(() => this.service.getMyTicket(requesterId, ticketNumber));
  }

  public createTicket(requesterId: string, draft: TicketDraft, now?: Date): Promise<TicketRecord> {
    return this.request(() => this.service.createTicket(requesterId, draft, now));
  }

  public updateTicket(requesterId: string, ticketNumber: string, input: unknown, now?: Date): Promise<TicketRecord> {
    return this.request(() => this.service.updateTicket(requesterId, ticketNumber, input, now));
  }

  public reopenTicket(requesterId: string, ticketNumber: string, now?: Date): Promise<TicketRecord> {
    return this.request(() => this.service.reopenTicket(requesterId, ticketNumber, now));
  }

  private request<T>(operation: () => T): Promise<T> {
    const failureRate = this.options.failureRate ?? 0.1;
    const failureDelayMs = this.options.failureDelayMs ?? 2000;
    const random = this.options.random ?? Math.random;
    return withLegacyRetry(async () => {
      if (random() < failureRate) {
        await new Promise<void>((resolve) => setTimeout(resolve, failureDelayMs));
        throw new LegacyUnavailableError();
      }
      return operation();
    }, this.options);
  }
}