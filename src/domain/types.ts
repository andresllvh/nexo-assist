export type TicketType = 'INC' | 'REQ'

export const CATEGORIES = ['Acesso', 'Rede e VPN', 'Hardware', 'Software', 'E-mail', 'Outros'] as const
export type Category = (typeof CATEGORIES)[number]

export const PRIORITIES = ['Crítica', 'Alta', 'Média', 'Baixa'] as const
export type Priority = (typeof PRIORITIES)[number]

export const TICKET_STATUSES = [
  'Aberto',
  'Em andamento',
  'Aguardando analista',
  'Aguardando você',
  'Aprovado',
  'Resolvido',
  'Fechado',
] as const
export type TicketStatus = (typeof TICKET_STATUSES)[number]

export const CLOSED_STATUSES: readonly TicketStatus[] = ['Resolvido', 'Fechado']

export type Impact = 'individual' | 'equipe' | 'empresa'

export type Ticket = {
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
  createdAt: Date
  updatedAt: Date
  resolvedAt: Date | null
}

export type TicketEvent = {
  id: string
  ticketId: string
  kind: 'criado' | 'atualizado' | 'reaberto' | 'transferido' | 'status'
  text: string
  createdAt: Date
}

export type Employee = {
  id: string
  name: string
  email: string
  role: 'employee' | 'analyst'
  department: string
  /** sistema operacional do notebook corporativo, usado pelos artigos da central */
  os: 'Windows 10' | 'Windows 11' | 'macOS'
  supportLevel: 'N1' | 'N2' | null
}

export function isOpen(ticket: Pick<Ticket, 'status'>): boolean {
  return !CLOSED_STATUSES.includes(ticket.status)
}
