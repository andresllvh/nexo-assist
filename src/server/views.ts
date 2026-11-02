import { slaStatus } from '@/domain/priority'
import type { Ticket } from '@/domain/types'
import { isOpen } from '@/domain/types'
import type { TicketView } from '@/shared/chat'

export function toTicketView(ticket: Ticket, now: Date = new Date()): TicketView {
  const sla = slaStatus(ticket, now)
  return {
    id: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: ticket.description,
    category: ticket.category,
    subcategory: ticket.subcategory,
    priority: ticket.priority,
    status: ticket.status,
    open: isOpen(ticket),
    createdAt: ticket.createdAt.toISOString(),
    updatedAt: ticket.updatedAt.toISOString(),
    resolvedAt: ticket.resolvedAt?.toISOString() ?? null,
    dueAt: sla?.dueAt.toISOString() ?? null,
    overdue: sla?.overdue ?? false,
    slaLabel: sla?.slaLabel ?? null,
  }
}
