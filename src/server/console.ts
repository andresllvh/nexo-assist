import { formatLocalTime } from '@/domain/business-time'
import type { Employee } from '@/domain/types'
import type { ConversationView, TicketView } from '@/shared/chat'
import { getApp } from './app'
import { findEmployee, initials } from './employees'
import { resilient } from './tickets/resilient'
import { toTicketView } from './views'

export type ConsoleListItem = {
  id: string
  status: ConversationView['status']
  employee: { id: string; name: string; initials: string; department: string }
  lastText: string
  lastAuthor: string | null
  lastAt: string
  pending: number
  handoff: ConversationView['handoff']
  ticketId: string | null
  assignedAnalyst: { id: string; name: string } | null
}

export async function listConversations(): Promise<ConsoleListItem[]> {
  const app = await getApp()
  const rows = await app.conversations.listAll()
  return rows
    .filter(({ last }) => last !== null)
    .map(({ conversation, last, pendingFromEmployee }) => {
      const employee = findEmployee(conversation.employeeId)
      const analyst = conversation.assignedAnalystId ? findEmployee(conversation.assignedAnalystId) : undefined
      return {
        id: conversation.id,
        status: conversation.status,
        employee: {
          id: conversation.employeeId,
          name: employee?.name ?? conversation.employeeId,
          initials: initials(employee?.name ?? '?'),
          department: employee?.department ?? '',
        },
        lastText: last?.text ?? '',
        lastAuthor: last ? last.author : null,
        lastAt: last?.createdAt ?? conversation.updatedAt.toISOString(),
        pending: pendingFromEmployee,
        handoff: conversation.handoff,
        ticketId: conversation.ticketId,
        assignedAnalyst: analyst ? { id: analyst.id, name: analyst.name } : null,
      }
    })
}

export type ConsoleDetail = {
  conversation: ConversationView
  employee: { id: string; name: string; initials: string; department: string; email: string }
  tickets: TicketView[]
  ticketsError: string | null
}

export async function conversationDetail(id: string): Promise<ConsoleDetail | null> {
  const app = await getApp()
  const conversation = await app.conversations.get(id)
  if (!conversation) return null
  const employee = findEmployee(conversation.employeeId)
  // o analista vê os chamados do funcionário da conversa (é o painel lateral do console)
  const tickets = resilient(app.tickets, { delaysMs: [300, 800] })
  let list: TicketView[] = []
  let ticketsError: string | null = null
  try {
    list = (await tickets.listByRequester(conversation.employeeId)).map((t) => toTicketView(t))
  } catch (error) {
    console.error('[console] falha ao listar chamados', error)
    ticketsError = 'Sistema de chamados indisponível. Tente atualizar em alguns segundos.'
  }
  return {
    conversation: await app.conversations.view(conversation),
    employee: {
      id: conversation.employeeId,
      name: employee?.name ?? conversation.employeeId,
      initials: initials(employee?.name ?? '?'),
      department: employee?.department ?? '',
      email: employee?.email ?? '',
    },
    tickets: list,
    ticketsError,
  }
}

export type ConsoleAction = { action: 'assume' } | { action: 'return' } | { action: 'close' } | { action: 'message'; text: string }

export class ConsoleActionError extends Error {}

/** Ações do analista: assumir (agent pausa), responder, devolver ao agent e encerrar. */
export async function applyAction(analyst: Employee, id: string, input: ConsoleAction): Promise<void> {
  const app = await getApp()
  const conversation = await app.conversations.get(id)
  if (!conversation) throw new ConsoleActionError('Conversa não encontrada.')
  const now = formatLocalTime(new Date())
  const tickets = resilient(app.tickets, { delaysMs: [300, 800] })

  switch (input.action) {
    case 'assume': {
      if (conversation.status === 'closed') throw new ConsoleActionError('Esta conversa já foi encerrada.')
      if (conversation.status === 'analyst' && conversation.assignedAnalystId !== analyst.id) {
        throw new ConsoleActionError('Outro analista já está atendendo esta conversa.')
      }
      await app.conversations.assign(id, analyst.id)
      if (conversation.ticketId) {
        await tickets
          .setStatus(conversation.ticketId, conversation.employeeId, 'Em andamento', `Assumido por ${analyst.name}`)
          .catch(() => undefined)
      }
      await app.conversations.addMessage({
        conversationId: id,
        author: 'system',
        authorId: null,
        text: `${analyst.name} assumiu · agent pausado · ${now}`,
      })
      return
    }
    case 'message': {
      if (conversation.status !== 'analyst' || conversation.assignedAnalystId !== analyst.id) {
        throw new ConsoleActionError('Assuma o atendimento para responder.')
      }
      await app.conversations.addMessage({ conversationId: id, author: 'analyst', authorId: analyst.id, text: input.text })
      return
    }
    case 'return': {
      if (conversation.status === 'closed') throw new ConsoleActionError('Esta conversa já foi encerrada.')
      await app.conversations.returnToAgent(id)
      await app.conversations.addMessage({
        conversationId: id,
        author: 'system',
        authorId: null,
        text: `${analyst.name} devolveu a conversa ao agent · ${now}`,
      })
      return
    }
    case 'close': {
      await app.conversations.addMessage({
        conversationId: id,
        author: 'system',
        authorId: null,
        text: `Atendimento encerrado por ${analyst.name} · ${now}`,
      })
      await app.conversations.close(id)
      return
    }
  }
}
