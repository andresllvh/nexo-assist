import type { Client, InStatement } from '@libsql/client'
import type { Category, Impact, Priority, TicketStatus, TicketType } from '@/domain/types'
import { newId } from './db'

type SeedTicket = {
  id: string
  type: TicketType
  title: string
  description: string
  category: Category
  subcategory: string | null
  priority: Priority
  status: TicketStatus
  requesterId: string
  affected: Impact
  /** dias atrás; as datas são relativas a "agora" para os cenários (vencido, resolvido há 4 dias) continuarem válidos */
  createdDaysAgo: number
  updatedDaysAgo: number
  resolvedDaysAgo?: number
}

const TICKETS: SeedTicket[] = [
  // Ana: um vencido, um em andamento, uma requisição aprovada, um resolvido recentemente e dois antigos
  {
    id: 'INC-20311', type: 'INC', title: 'Notebook lento após atualização do Windows',
    description: 'Lentidão geral desde a atualização do Windows. Reiniciar e rodar o diagnóstico da central não resolveu.',
    category: 'Hardware', subcategory: 'Notebook', priority: 'Média', status: 'Aguardando analista',
    requesterId: 'e-ana', affected: 'individual', createdDaysAgo: 17, updatedDaysAgo: 6,
  },
  {
    id: 'INC-20298', type: 'INC', title: 'Acesso à pasta Financeiro no SharePoint',
    description: 'Sem permissão para abrir a pasta Financeiro/Fechamento no SharePoint depois da troca de equipe.',
    category: 'Acesso', subcategory: 'SharePoint', priority: 'Média', status: 'Em andamento',
    requesterId: 'e-ana', affected: 'individual', createdDaysAgo: 19, updatedDaysAgo: 1,
  },
  {
    id: 'REQ-10442', type: 'REQ', title: 'Segundo monitor para home office',
    description: 'Pedido de um segundo monitor para trabalhar em casa.',
    category: 'Hardware', subcategory: 'Monitor', priority: 'Baixa', status: 'Aprovado',
    requesterId: 'e-ana', affected: 'individual', createdDaysAgo: 24, updatedDaysAgo: 2,
  },
  {
    id: 'INC-20150', type: 'INC', title: 'Senha do SAP bloqueada',
    description: 'Senha do SAP bloqueada após várias tentativas.',
    category: 'Acesso', subcategory: 'SAP', priority: 'Média', status: 'Resolvido',
    requesterId: 'e-ana', affected: 'individual', createdDaysAgo: 6, updatedDaysAgo: 4, resolvedDaysAgo: 4,
  },
  {
    id: 'INC-19877', type: 'INC', title: 'Outlook não sincroniza no celular',
    description: 'E-mails não chegam no app do Outlook no celular.',
    category: 'E-mail', subcategory: 'Outlook', priority: 'Média', status: 'Resolvido',
    requesterId: 'e-ana', affected: 'individual', createdDaysAgo: 64, updatedDaysAgo: 61, resolvedDaysAgo: 61,
  },
  {
    id: 'INC-19410', type: 'INC', title: 'Troca de senha da rede',
    description: 'Senha da rede expirou e não consegui trocar pelo portal.',
    category: 'Acesso', subcategory: 'Rede', priority: 'Alta', status: 'Resolvido',
    requesterId: 'e-ana', affected: 'individual', createdDaysAgo: 115, updatedDaysAgo: 114, resolvedDaysAgo: 114,
  },
  // outros funcionários: servem para provar que um não vê chamado do outro
  {
    id: 'INC-20322', type: 'INC', title: 'Sem acesso ao SAP',
    description: 'Usuário do SAP não aparece depois da mudança para o Comercial.',
    category: 'Acesso', subcategory: 'SAP', priority: 'Alta', status: 'Em andamento',
    requesterId: 'e-carla', affected: 'individual', createdDaysAgo: 1, updatedDaysAgo: 0,
  },
  {
    id: 'INC-20330', type: 'INC', title: 'Impressora do 3º andar não imprime',
    description: 'Fila de impressão travada na impressora do 3º andar.',
    category: 'Hardware', subcategory: 'Impressora', priority: 'Média', status: 'Aberto',
    requesterId: 'e-diego', affected: 'equipe', createdDaysAgo: 2, updatedDaysAgo: 2,
  },
  {
    id: 'REQ-10450', type: 'REQ', title: 'Licença do Figma',
    description: 'Pedido de licença do Figma para o time de Marketing.',
    category: 'Software', subcategory: 'Licença', priority: 'Baixa', status: 'Aberto',
    requesterId: 'e-bruno', affected: 'individual', createdDaysAgo: 3, updatedDaysAgo: 3,
  },
]

const DAY = 24 * 60 * 60 * 1000

export async function seed(db: Client, now: Date = new Date()): Promise<void> {
  const ago = (days: number) => now.getTime() - days * DAY
  const statements: InStatement[] = [
    'DELETE FROM messages',
    'DELETE FROM drafts',
    'DELETE FROM conversations',
    'DELETE FROM ticket_events',
    'DELETE FROM tickets',
    'DELETE FROM counters',
  ]

  for (const t of TICKETS) {
    statements.push({
      sql: `INSERT INTO tickets (id, type, title, description, category, subcategory, priority, status,
              requester_id, affected, created_at, updated_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        t.id, t.type, t.title, t.description, t.category, t.subcategory, t.priority, t.status,
        t.requesterId, t.affected, ago(t.createdDaysAgo), ago(t.updatedDaysAgo),
        t.resolvedDaysAgo === undefined ? null : ago(t.resolvedDaysAgo),
      ],
    })
    statements.push({
      sql: 'INSERT INTO ticket_events (id, ticket_id, kind, text, created_at) VALUES (?, ?, ?, ?, ?)',
      args: [newId('evt'), t.id, 'criado', 'Chamado aberto pelo formulário', ago(t.createdDaysAgo)],
    })
  }
  statements.push(
    { sql: 'INSERT INTO counters (name, value) VALUES (?, ?)', args: ['INC', 20516] },
    { sql: 'INSERT INTO counters (name, value) VALUES (?, ?)', args: ['REQ', 10460] },
    { sql: 'INSERT INTO counters (name, value) VALUES (?, ?)', args: ['D', 380] },
  )
  await db.batch(statements, 'write')
}

export async function ensureSeeded(db: Client): Promise<void> {
  const rs = await db.execute('SELECT COUNT(*) AS n FROM tickets')
  if (Number(rs.rows[0]?.n ?? 0) === 0) await seed(db)
}
