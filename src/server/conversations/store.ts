import type { Client, Row } from '@libsql/client'
import { findEmployee } from '../employees'
import { newId, nextSequence } from '../db'
import type {
  Author,
  Block,
  ConversationStatus,
  ConversationView,
  DraftStatus,
  DraftView,
  Handoff,
  MessageView,
  Trace,
} from '@/shared/chat'

type ConversationRow = {
  id: string
  employeeId: string
  status: ConversationStatus
  assignedAnalystId: string | null
  ticketId: string | null
  handoff: Handoff | null
  createdAt: Date
  updatedAt: Date
}

export type NewMessage = {
  conversationId: string
  author: Author
  authorId: string | null
  text: string
  blocks?: Block[]
  trace?: Trace | null
}

/** Conversas, mensagens e rascunhos. É o "estado" do atendimento e sobrevive a reinícios. */
export class ConversationStore {
  private db: Client
  private now: () => Date

  constructor(db: Client, now: () => Date = () => new Date()) {
    this.db = db
    this.now = now
  }

  async latestOpenFor(employeeId: string): Promise<ConversationRow | null> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM conversations WHERE employee_id = ? AND status != 'closed'
            ORDER BY updated_at DESC LIMIT 1`,
      args: [employeeId],
    })
    return rs.rows[0] ? toConversation(rs.rows[0]) : null
  }

  async create(employeeId: string): Promise<ConversationRow> {
    const id = newId('conv')
    const at = this.now().getTime()
    await this.db.execute({
      sql: `INSERT INTO conversations (id, employee_id, status, created_at, updated_at) VALUES (?, ?, 'agent', ?, ?)`,
      args: [id, employeeId, at, at],
    })
    const created = await this.get(id)
    if (!created) throw new Error('Falha ao criar conversa')
    return created
  }

  /** "Voltar outro dia e continuar de onde parei": reabre a última conversa não encerrada. */
  async resumeOrCreate(employeeId: string): Promise<ConversationRow> {
    return (await this.latestOpenFor(employeeId)) ?? this.create(employeeId)
  }

  async get(id: string): Promise<ConversationRow | null> {
    const rs = await this.db.execute({ sql: 'SELECT * FROM conversations WHERE id = ?', args: [id] })
    return rs.rows[0] ? toConversation(rs.rows[0]) : null
  }

  async getForEmployee(id: string, employeeId: string): Promise<ConversationRow | null> {
    const conv = await this.get(id)
    return conv && conv.employeeId === employeeId ? conv : null
  }

  async messages(conversationId: string, limit = 200): Promise<MessageView[]> {
    const rs = await this.db.execute({
      sql: `SELECT * FROM (SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)
            ORDER BY created_at ASC`,
      args: [conversationId, limit],
    })
    return rs.rows.map(toMessage)
  }

  async addMessage(input: NewMessage): Promise<MessageView> {
    const id = newId('msg')
    const at = this.now().getTime()
    await this.db.batch(
      [
        {
          sql: `INSERT INTO messages (id, conversation_id, author, author_id, text, blocks, trace, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            id,
            input.conversationId,
            input.author,
            input.authorId,
            input.text,
            JSON.stringify(input.blocks ?? []),
            input.trace ? JSON.stringify(input.trace) : null,
            at,
          ],
        },
        { sql: 'UPDATE conversations SET updated_at = ? WHERE id = ?', args: [at, input.conversationId] },
      ],
      'write',
    )
    const rs = await this.db.execute({ sql: 'SELECT * FROM messages WHERE id = ?', args: [id] })
    const row = rs.rows[0]
    if (!row) throw new Error('Falha ao gravar mensagem')
    return toMessage(row)
  }

  async countEmployeeMessages(conversationId: string): Promise<number> {
    const rs = await this.db.execute({
      sql: `SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND author = 'employee'`,
      args: [conversationId],
    })
    return Number(rs.rows[0]?.n ?? 0)
  }

  async handOff(conversationId: string, handoff: Handoff, ticketId: string | null): Promise<void> {
    await this.db.execute({
      sql: `UPDATE conversations SET status = 'waiting', assigned_analyst_id = NULL,
              ticket_id = COALESCE(?, ticket_id), handoff_kind = ?, handoff_reason = ?, handoff_summary = ?,
              handoff_confidence = ?, handoff_at = ?, updated_at = ?
            WHERE id = ?`,
      args: [
        ticketId,
        handoff.kind,
        handoff.reason,
        handoff.summary,
        handoff.confidence,
        new Date(handoff.at).getTime(),
        this.now().getTime(),
        conversationId,
      ],
    })
  }

  async setTicket(conversationId: string, ticketId: string): Promise<void> {
    await this.db.execute({
      sql: 'UPDATE conversations SET ticket_id = ? WHERE id = ?',
      args: [ticketId, conversationId],
    })
  }

  async assign(conversationId: string, analystId: string): Promise<void> {
    await this.db.execute({
      sql: `UPDATE conversations SET status = 'analyst', assigned_analyst_id = ?, updated_at = ? WHERE id = ?`,
      args: [analystId, this.now().getTime(), conversationId],
    })
  }

  async returnToAgent(conversationId: string): Promise<void> {
    await this.db.execute({
      sql: `UPDATE conversations SET status = 'agent', assigned_analyst_id = NULL, handoff_kind = NULL,
              handoff_reason = NULL, handoff_summary = NULL, handoff_confidence = NULL, handoff_at = NULL, updated_at = ?
            WHERE id = ?`,
      args: [this.now().getTime(), conversationId],
    })
  }

  async close(conversationId: string): Promise<void> {
    await this.db.execute({
      sql: `UPDATE conversations SET status = 'closed', updated_at = ? WHERE id = ?`,
      args: [this.now().getTime(), conversationId],
    })
  }

  /** Todas as conversas com a última mensagem, para o console do analista. */
  async listAll(): Promise<{ conversation: ConversationRow; last: MessageView | null; pendingFromEmployee: number }[]> {
    const rs = await this.db.execute(`SELECT * FROM conversations ORDER BY updated_at DESC LIMIT 100`)
    const result = []
    for (const row of rs.rows) {
      const conversation = toConversation(row)
      const lastRs = await this.db.execute({
        sql: 'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 1',
        args: [conversation.id],
      })
      // mensagens do funcionário que chegaram depois da última resposta de alguém do service desk
      const pendingRs = await this.db.execute({
        sql: `SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND author = 'employee'
                AND created_at > COALESCE((SELECT MAX(created_at) FROM messages
                  WHERE conversation_id = ? AND author IN ('agent', 'analyst')), 0)`,
        args: [conversation.id, conversation.id],
      })
      result.push({
        conversation,
        last: lastRs.rows[0] ? toMessage(lastRs.rows[0]) : null,
        pendingFromEmployee: Number(pendingRs.rows[0]?.n ?? 0),
      })
    }
    return result
  }

  async view(conversation: ConversationRow): Promise<ConversationView> {
    const analyst = conversation.assignedAnalystId ? findEmployee(conversation.assignedAnalystId) : undefined
    return {
      id: conversation.id,
      status: conversation.status,
      employeeId: conversation.employeeId,
      ticketId: conversation.ticketId,
      assignedAnalyst: analyst ? { id: analyst.id, name: analyst.name } : null,
      handoff: conversation.handoff,
      userMessageCount: await this.countEmployeeMessages(conversation.id),
      messages: await this.messages(conversation.id),
      updatedAt: conversation.updatedAt.toISOString(),
    }
  }

  // ---- rascunhos: chamado só é criado/alterado depois da confirmação ----

  async createDraft(conversationId: string, draft: Omit<DraftView, 'id' | 'status' | 'ticketId'>): Promise<DraftView> {
    const number = await nextSequence(this.db, 'D', 380)
    const full: DraftView = { ...draft, id: `D-${number}`, status: 'pending', ticketId: null }
    // um rascunho novo substitui o anterior ainda pendente na mesma conversa
    await this.db.execute({
      sql: `UPDATE drafts SET status = 'cancelled' WHERE conversation_id = ? AND status = 'pending'`,
      args: [conversationId],
    })
    await this.db.execute({
      sql: `INSERT INTO drafts (id, conversation_id, kind, payload, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)`,
      args: [full.id, conversationId, full.kind, JSON.stringify(full), this.now().getTime()],
    })
    return full
  }

  async getDraft(id: string, conversationId: string): Promise<DraftView | null> {
    const rs = await this.db.execute({
      sql: 'SELECT * FROM drafts WHERE id = ? AND conversation_id = ?',
      args: [id, conversationId],
    })
    const row = rs.rows[0]
    if (!row) return null
    const draft = JSON.parse(String(row.payload)) as DraftView
    return { ...draft, status: String(row.status) as DraftStatus, ticketId: row.ticket_id === null ? null : String(row.ticket_id) }
  }

  async pendingDraft(conversationId: string): Promise<DraftView | null> {
    const rs = await this.db.execute({
      sql: `SELECT id FROM drafts WHERE conversation_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1`,
      args: [conversationId],
    })
    const row = rs.rows[0]
    return row ? this.getDraft(String(row.id), conversationId) : null
  }

  /** Marca o rascunho; retorna false se ele já não estava pendente (evita confirmar duas vezes). */
  async settleDraft(id: string, conversationId: string, status: Exclude<DraftStatus, 'pending'>, ticketId: string | null): Promise<boolean> {
    const rs = await this.db.execute({
      sql: `UPDATE drafts SET status = ?, ticket_id = ? WHERE id = ? AND conversation_id = ? AND status = 'pending'`,
      args: [status, ticketId, id, conversationId],
    })
    return rs.rowsAffected === 1
  }

  /** Atualiza o rascunho exibido numa mensagem já gravada, para o cartão mostrar "Confirmado". */
  async refreshDraftBlocks(conversationId: string, draft: DraftView): Promise<void> {
    const rs = await this.db.execute({
      sql: `SELECT id, blocks FROM messages WHERE conversation_id = ? AND blocks LIKE ?`,
      args: [conversationId, `%"id":"${draft.id}"%`],
    })
    for (const row of rs.rows) {
      const blocks = (JSON.parse(String(row.blocks)) as Block[]).map((b) =>
        b.kind === 'draft' && b.draft.id === draft.id ? { ...b, draft } : b,
      )
      await this.db.execute({ sql: 'UPDATE messages SET blocks = ? WHERE id = ?', args: [JSON.stringify(blocks), String(row.id)] })
    }
  }
}

function toConversation(r: Row): ConversationRow {
  const kind = r.handoff_kind === null ? null : (String(r.handoff_kind) as Handoff['kind'])
  return {
    id: String(r.id),
    employeeId: String(r.employee_id),
    status: String(r.status) as ConversationStatus,
    assignedAnalystId: r.assigned_analyst_id === null ? null : String(r.assigned_analyst_id),
    ticketId: r.ticket_id === null ? null : String(r.ticket_id),
    handoff: kind
      ? {
          kind,
          reason: String(r.handoff_reason ?? ''),
          summary: String(r.handoff_summary ?? ''),
          confidence: r.handoff_confidence === null ? null : Number(r.handoff_confidence),
          at: new Date(Number(r.handoff_at)).toISOString(),
        }
      : null,
    createdAt: new Date(Number(r.created_at)),
    updatedAt: new Date(Number(r.updated_at)),
  }
}

function toMessage(r: Row): MessageView {
  const author = String(r.author) as Author
  const authorId = r.author_id === null ? null : String(r.author_id)
  return {
    id: String(r.id),
    author,
    authorName: author === 'agent' ? 'Nexo Assist' : author === 'system' ? 'Sistema' : (authorId && findEmployee(authorId)?.name) || 'Funcionário',
    text: String(r.text),
    blocks: JSON.parse(String(r.blocks)) as Block[],
    trace: r.trace === null ? null : (JSON.parse(String(r.trace)) as Trace),
    createdAt: new Date(Number(r.created_at)).toISOString(),
  }
}

export type { ConversationRow }
