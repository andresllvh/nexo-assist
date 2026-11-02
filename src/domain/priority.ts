import { addBusinessDays, addBusinessHours } from './business-time'
import type { Impact, Priority, Ticket, TicketType } from './types'
import { isOpen } from './types'

export type PriorityFactors = {
  type: TicketType
  impact: Impact
  /** o problema impede de trabalhar (parou, não há como contornar) */
  workStopped: boolean
  /** há um compromisso em risco no mesmo dia (reunião, entrega, viagem) */
  sameDayCommitment: boolean
}

export type PriorityDecision = {
  priority: Priority
  /** regra do Anexo A que levou à prioridade, em linguagem simples */
  rule: string
}

/**
 * Prioridade = impacto × urgência, conforme o Anexo A.
 * O modelo só informa os fatores; a prioridade é calculada aqui, de forma determinística.
 */
export function classifyPriority(f: PriorityFactors): PriorityDecision {
  if (f.workStopped && f.impact !== 'individual') {
    return {
      priority: 'Crítica',
      rule: `algo parado para ${f.impact === 'empresa' ? 'a empresa' : 'uma equipe'}`,
    }
  }
  if (f.sameDayCommitment) {
    return { priority: 'Alta', rule: 'há um compromisso em risco no mesmo dia' }
  }
  if (f.workStopped) {
    return { priority: 'Alta', rule: 'impede uma pessoa de trabalhar' }
  }
  if (f.type === 'INC') {
    return { priority: 'Média', rule: 'atrapalha, mas há alternativa' }
  }
  return { priority: 'Baixa', rule: 'pedido sem urgência' }
}

export const SLA_LABEL: Record<Priority, string> = {
  Crítica: '1 hora',
  Alta: '4 horas úteis',
  Média: '3 dias úteis',
  Baixa: '5 dias úteis',
}

/** Prazo para a próxima resposta, contado a partir da última atualização. */
export function computeDueAt(priority: Priority, from: Date): Date {
  switch (priority) {
    case 'Crítica':
      // casos críticos têm plantão 24 horas: o relógio não para
      return new Date(from.getTime() + 60 * 60 * 1000)
    case 'Alta':
      return addBusinessHours(from, 4)
    case 'Média':
      return addBusinessDays(from, 3)
    case 'Baixa':
      return addBusinessDays(from, 5)
  }
}

export type SlaStatus = {
  dueAt: Date
  overdue: boolean
  slaLabel: string
}

export function slaStatus(ticket: Pick<Ticket, 'priority' | 'status' | 'updatedAt'>, now: Date): SlaStatus | null {
  if (!isOpen(ticket)) return null
  const dueAt = computeDueAt(ticket.priority, ticket.updatedAt)
  return { dueAt, overdue: now > dueAt, slaLabel: SLA_LABEL[ticket.priority] }
}
