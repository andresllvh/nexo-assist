import type { TicketService } from './service'
import { TicketServiceUnavailableError } from './service'

export type RetryOptions = {
  /** espera antes de cada nova tentativa, em ms; o tamanho define quantas novas tentativas existem */
  delaysMs: number[]
  onRetry?: (attempt: number, error: Error) => void
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** Repete só quando o legado está fora do ar; erros de negócio (ex.: chamado não encontrado) sobem na hora. */
export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const delay = opts.delaysMs[attempt]
      if (!(error instanceof TicketServiceUnavailableError) || delay === undefined) throw error
      opts.onRetry?.(attempt + 1, error)
      await sleep(delay)
    }
  }
}

/** Envolve o serviço de chamados com novas tentativas e backoff. */
export function resilient(service: TicketService, opts: RetryOptions): TicketService {
  const wrap =
    <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
    (...args: A) =>
      withRetry(() => fn.apply(service, args), opts)

  return {
    listByRequester: wrap(service.listByRequester),
    get: wrap(service.get),
    events: wrap(service.events),
    create: wrap(service.create),
    addInformation: wrap(service.addInformation),
    reopen: wrap(service.reopen),
    markTransferred: wrap(service.markTransferred),
    setStatus: wrap(service.setStatus),
  }
}
