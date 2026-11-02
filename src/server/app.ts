import type { Client } from '@libsql/client'
import { ConversationStore } from './conversations/store'
import { createDb, migrate } from './db'
import { ensureSeeded } from './seed'
import { SqlTicketService } from './tickets/service'

type App = {
  db: Client
  conversations: ConversationStore
  /** serviço "cru", com as falhas simuladas do legado; o agent usa a versão com novas tentativas */
  tickets: SqlTicketService
}

// Em dev o Next recarrega módulos; guardar no globalThis evita abrir várias conexões.
const globalForApp = globalThis as unknown as { nexoApp?: Promise<App> }

async function boot(): Promise<App> {
  const db = createDb(process.env.DATABASE_URL ?? 'file:data/nexo.db')
  await migrate(db)
  await ensureSeeded(db)
  const failureRate = Number(process.env.TICKETS_FAILURE_RATE ?? 0.1)
  return {
    db,
    conversations: new ConversationStore(db),
    tickets: new SqlTicketService(db, { failureRate, latencyMs: 120 }),
  }
}

export function getApp(): Promise<App> {
  globalForApp.nexoApp ??= boot()
  return globalForApp.nexoApp
}
