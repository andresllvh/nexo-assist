import type { Client, Row } from '@libsql/client'
import type { Category, Impact, Priority, Ticket, TicketEvent, TicketStatus, TicketType } from '@/domain/types'
import { newId, nextSequence } from '../db'

/** O sistema de chamados é legado e às vezes fica fora do ar por alguns segundos. */
export class TicketServiceUnavailableError extends Error {
  constructor() {
    super('Sistema de chamados indisponível no momento')
    this.name = 'TicketServiceUnavailableError'
  }
}

export class TicketNotFoundError extends Error {
  constructor(id: string) {
    super(`Chamado ${id} não encontrado`)
    this.name = 'TicketNotFoundError'
  }
}

export type NewTicket = {
  type: TicketType
  title: string
  description: string
  category: Category
  subcategory: string | null
  priority: Priority
  requesterId: string
  affected: Impact
}

/**
 * Contrato do serviço de chamados. O agent só conhece esta interface, nunca o banco.
 * Toda leitura recebe o id de quem pergunta: um funcionário nunca vê chamado de outro.
 */
export interface TicketService {
  listByRequester(requesterId: string): Promise<Ticket[]>
  get(id: string, requesterId: string): Promise<Ticket | null>
  events(id: string, requesterId: string): Promise<TicketEvent[]>
  create(input: NewTicket): Promise<Ticket>
  addInformation(id: string, requesterId: string, text: string): Promise<Ticket>
  reopen(id: string, requesterId: string, text: string): Promise<Ticket>
  markTransferred(id: string, requesterId: string, text: string): Promise<Ticket>
  setStatus(id: string, requesterId: string, status: TicketStatus, text: string): Promise<Ticket>
}

export type SimulationOptions = {
  /** probabilidade de cada chamada falhar (0 a 1) */
  failureRate: number
  /** latência simulada, em ms */
  latencyMs: number
  random: () => number
  now: () => Date
}

export class SqlTicketService implements TicketService {
  private db: Client
  private sim: SimulationOptions

  constructor(db: Client, sim: Partial<SimulationOptions> = {}) {
    this.db = db
    this.sim = {
      failureRate: sim.failureRate ?? 0,
      latencyMs: sim.latencyMs ?? 0,
      random: sim.random ?? Math.random,
      now: sim.now ?? (() => new Date()),
    }
  }

  private async legacyCall(): Promise<void> {
    if (this.sim.latencyMs > 0) await new Promise((r) => setTimeout(r, this.sim.latencyMs))
    if (this.sim.random() < this.sim.failureRate) throw new TicketServiceUnavailableError()
  }

  async listByRequester(requesterId: string): Promise<Ticket[]> {
    await this.legacyCall()
    const rs = await this.db.execute({
      sql: 'SELECT * FROM tickets WHERE requester_id = ? ORDER BY updated_at DESC',
      args: [requesterId],
    })
    return rs.rows.map(toTicket)
  }

  async get(id: string, requesterId: string): Promise<Ticket | null> {
    await this.legacyCall()
    const rs = await this.db.execute({
      sql: 'SELECT * FROM tickets WHERE id = ? AND requester_id = ?',
      args: [id.toUpperCase(), requesterId],
    })
    const row = rs.rows[0]
    return row ? toTicket(row) : null
  }

  async events(id: string, requesterId: string): Promise<TicketEvent[]> {
    const ticket = await this.get(id, requesterId)
    if (!ticket) throw new TicketNotFoundError(id)
    const rs = await this.db.execute({
      sql: 'SELECT * FROM ticket_events WHERE ticket_id = ? ORDER BY created_at ASC',
      args: [ticket.id],
    })
    return rs.rows.map((r) => ({
      id: String(r.id),
      ticketId: String(r.ticket_id),
      kind: String(r.kind) as TicketEvent['kind'],
      text: String(r.text),
      createdAt: new Date(Number(r.created_at)),
    }))
  }

  async create(input: NewTicket): Promise<Ticket> {
    await this.legacyCall()
    const now = this.sim.now()
    const number = await nextSequence(this.db, input.type, input.type === 'INC' ? 20500 : 10500)
    const id = `${input.type}-${number}`
    await this.db.execute({
      sql: `INSERT INTO tickets (id, type, title, description, category, subcategory, priority, status,
              requester_id, affected, created_at, updated_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Aberto', ?, ?, ?, ?, NULL)`,
      args: [
        id,
        input.type,
        input.title,
        input.description,
        input.category,
        input.subcategory,
        input.priority,
        input.requesterId,
        input.affected,
        now.getTime(),
        now.getTime(),
      ],
    })
    await this.addEvent(id, 'criado', 'Chamado aberto pelo Nexo Assist', now)
    const created = await this.get(id, input.requesterId)
    if (!created) throw new TicketNotFoundError(id)
    return created
  }

  async addInformation(id: string, requesterId: string, text: string): Promise<Ticket> {
    return this.change(id, requesterId, 'atualizado', text, (t) => t.status)
  }

  async reopen(id: string, requesterId: string, text: string): Promise<Ticket> {
    return this.change(id, requesterId, 'reaberto', text, () => 'Aberto', true)
  }

  async markTransferred(id: string, requesterId: string, text: string): Promise<Ticket> {
    return this.change(id, requesterId, 'transferido', text, () => 'Aguardando analista')
  }

  async setStatus(id: string, requesterId: string, status: TicketStatus, text: string): Promise<Ticket> {
    return this.change(id, requesterId, 'status', text, () => status)
  }

  private async change(
    id: string,
    requesterId: string,
    kind: TicketEvent['kind'],
    text: string,
    nextStatus: (t: Ticket) => TicketStatus,
    clearResolution = false,
  ): Promise<Ticket> {
    const ticket = await this.get(id, requesterId)
    if (!ticket) throw new TicketNotFoundError(id)
    const now = this.sim.now()
    const status = nextStatus(ticket)
    const resolvedAt = status === 'Resolvido' ? now.getTime() : clearResolution ? null : ticket.resolvedAt?.getTime() ?? null
    await this.db.execute({
      sql: 'UPDATE tickets SET status = ?, updated_at = ?, resolved_at = ? WHERE id = ?',
      args: [status, now.getTime(), resolvedAt, ticket.id],
    })
    await this.addEvent(ticket.id, kind, text, now)
    const updated = await this.get(ticket.id, requesterId)
    if (!updated) throw new TicketNotFoundError(id)
    return updated
  }

  private async addEvent(ticketId: string, kind: TicketEvent['kind'], text: string, at: Date): Promise<void> {
    await this.db.execute({
      sql: 'INSERT INTO ticket_events (id, ticket_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [newId('evt'), ticketId, kind, text, at.getTime()],
    })
  }
}

function toTicket(r: Row): Ticket {
  return {
    id: String(r.id),
    type: String(r.type) as TicketType,
    title: String(r.title),
    description: String(r.description),
    category: String(r.category) as Category,
    subcategory: r.subcategory === null ? null : String(r.subcategory),
    priority: String(r.priority) as Priority,
    status: String(r.status) as TicketStatus,
    requesterId: String(r.requester_id),
    affected: String(r.affected) as Impact,
    createdAt: new Date(Number(r.created_at)),
    updatedAt: new Date(Number(r.updated_at)),
    resolvedAt: r.resolved_at === null ? null : new Date(Number(r.resolved_at)),
  }
}
