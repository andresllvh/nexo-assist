// Tipos compartilhados entre o servidor e a interface. Datas viajam como ISO string.
import type { Category, Impact, Priority, TicketStatus, TicketType } from '@/domain/types'

export const MESSAGE_LIMIT = 30

export type ConversationStatus = 'agent' | 'waiting' | 'analyst' | 'closed'
export type Author = 'employee' | 'agent' | 'analyst' | 'system'

export type TicketView = {
  id: string
  type: TicketType
  title: string
  description: string
  category: Category
  subcategory: string | null
  priority: Priority
  status: TicketStatus
  open: boolean
  createdAt: string
  updatedAt: string
  resolvedAt: string | null
  dueAt: string | null
  overdue: boolean
  slaLabel: string | null
}

export type DraftKind = 'create' | 'update' | 'reopen'
export type DraftStatus = 'pending' | 'confirmed' | 'cancelled'

export type DraftView = {
  id: string
  kind: DraftKind
  status: DraftStatus
  /** chamado criado ou alterado depois da confirmação */
  ticketId: string | null
  /** para atualização/reabertura: o chamado existente */
  targetTicketId: string | null
  type: TicketType
  title: string
  description: string
  category: Category
  priority: Priority
  priorityRule: string
  affected: Impact
  dueAt: string
  slaLabel: string
}

export type Block =
  | { kind: 'ticket_selector'; tickets: TicketView[] }
  | { kind: 'ticket_card'; ticket: TicketView }
  | { kind: 'draft'; draft: DraftView }
  | { kind: 'options'; question: string | null; options: string[] }

export const INTENTS = [
  'duvida',
  'consultar_chamado',
  'complementar_chamado',
  'abrir_chamado',
  'falar_com_analista',
  'confirmar',
  'corrigir',
  'cancelar',
  'fora_do_escopo',
  'conversa',
] as const
export type Intent = (typeof INTENTS)[number]

export const INTENT_LABEL: Record<Intent, string> = {
  duvida: 'tirar uma dúvida',
  consultar_chamado: 'consultar um chamado',
  complementar_chamado: 'complementar um chamado',
  abrir_chamado: 'abrir um chamado',
  falar_com_analista: 'falar com um analista',
  confirmar: 'confirmar o que foi proposto',
  corrigir: 'corrigir o rascunho',
  cancelar: 'cancelar o que foi proposto',
  fora_do_escopo: 'assunto fora de TI',
  conversa: 'conversa geral',
}

export type Decision = {
  intent: Intent
  /** o que o agent entendeu, em uma frase */
  understood: string
  /** ação tomada, em linguagem simples */
  action: string
  /** 0 a 1 */
  confidence: number
  reason: string
}

export type TraceStep = {
  id: string
  tool: string
  label: string
  status: 'ok' | 'error'
  input: unknown
  output: unknown
  retries: number
  ms: number
}

export type Trace = {
  decision: Decision
  steps: TraceStep[]
  /** 'agent' = passou pelo modelo; 'regra' = resolvido no código, sem chamar o modelo */
  path: 'agent' | 'regra'
  model: string | null
  usage: { inputTokens: number; outputTokens: number } | null
  ms: number
}

export type MessageView = {
  id: string
  author: Author
  authorName: string
  text: string
  blocks: Block[]
  trace: Trace | null
  createdAt: string
}

export type Handoff = {
  kind: 'pedido' | 'critico' | 'vencido' | 'baixa_confianca'
  reason: string
  summary: string
  confidence: number | null
  at: string
}

export type ConversationView = {
  id: string
  status: ConversationStatus
  employeeId: string
  ticketId: string | null
  assignedAnalyst: { id: string; name: string } | null
  handoff: Handoff | null
  userMessageCount: number
  messages: MessageView[]
  updatedAt: string
}

/** Eventos do streaming de uma resposta (uma linha JSON por evento). */
export type StreamEvent =
  | { type: 'decision'; decision: Decision }
  | { type: 'step'; step: TraceStep }
  | { type: 'text'; delta: string }
  | { type: 'message'; message: MessageView }
  | { type: 'conversation'; conversation: ConversationView }
  | { type: 'error'; message: string }
