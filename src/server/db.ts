import { createClient, type Client } from '@libsql/client'
import { mkdirSync } from 'node:fs'

// Um único arquivo SQLite (libsql) guarda chamados, conversas e o estado de cada conversa,
// então tudo sobrevive a um reinício. Em produção, a mesma URL pode apontar para um Turso.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL,
    subcategory TEXT,
    priority TEXT NOT NULL,
    status TEXT NOT NULL,
    requester_id TEXT NOT NULL,
    affected TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    resolved_at INTEGER
  )`,
  `CREATE INDEX IF NOT EXISTS tickets_requester ON tickets (requester_id)`,
  `CREATE TABLE IF NOT EXISTS ticket_events (
    id TEXT PRIMARY KEY,
    ticket_id TEXT NOT NULL REFERENCES tickets (id),
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL,
    status TEXT NOT NULL,
    assigned_analyst_id TEXT,
    ticket_id TEXT,
    handoff_reason TEXT,
    handoff_summary TEXT,
    handoff_kind TEXT,
    handoff_confidence REAL,
    handoff_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS conversations_employee ON conversations (employee_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations (id),
    author TEXT NOT NULL,
    author_id TEXT,
    text TEXT NOT NULL,
    blocks TEXT NOT NULL DEFAULT '[]',
    trace TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS messages_conversation ON messages (conversation_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS drafts (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations (id),
    kind TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL,
    ticket_id TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS counters (
    name TEXT PRIMARY KEY,
    value INTEGER NOT NULL
  )`,
]

export async function migrate(db: Client): Promise<void> {
  for (const statement of SCHEMA) await db.execute(statement)
}

/**
 * URL do banco: DATABASE_URL, ou as variáveis que a integração do Turso cria na Vercel
 * (com ou sem prefixo), ou o arquivo local.
 */
export function databaseUrl(): string {
  const env = process.env
  return env.DATABASE_URL || env.DATABASE_TURSO_DATABASE_URL || env.TURSO_DATABASE_URL || 'file:data/nexo.db'
}

function databaseToken(): string | undefined {
  const env = process.env
  return env.DATABASE_AUTH_TOKEN || env.DATABASE_TURSO_AUTH_TOKEN || env.TURSO_AUTH_TOKEN || undefined
}

export function createDb(url: string = databaseUrl()): Client {
  if (url.startsWith('file:') && !url.includes(':memory:')) {
    const path = url.slice('file:'.length)
    const dir = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '.'
    mkdirSync(dir, { recursive: true })
  }
  return createClient({ url, authToken: databaseToken() })
}

/** Próximo número de uma sequência (INC, REQ, rascunho). */
export async function nextSequence(db: Client, name: string, start: number): Promise<number> {
  const tx = await db.transaction('write')
  try {
    const row = await tx.execute({ sql: 'SELECT value FROM counters WHERE name = ?', args: [name] })
    const current = row.rows[0] ? Number(row.rows[0].value) : start
    const next = current + 1
    await tx.execute({
      sql: 'INSERT INTO counters (name, value) VALUES (?, ?) ON CONFLICT (name) DO UPDATE SET value = excluded.value',
      args: [name, next],
    })
    await tx.commit()
    return next
  } finally {
    tx.close()
  }
}

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`
}
