import { canReopen, findDuplicate } from '@/domain/duplicates'
import { formatLocalTime, isSameLocalDay, formatLocalDate, businessHoursBetween } from '@/domain/business-time'
import { classifyPriority, computeDueAt, SLA_LABEL, type PriorityFactors } from '@/domain/priority'
import type { Category, Impact, Ticket } from '@/domain/types'
import { isOpen } from '@/domain/types'
import type { DraftView, Handoff, TicketView } from '@/shared/chat'
import { toTicketView } from '../views'
import { recordStep, type TurnContext } from './context'

// Operações de negócio usadas tanto pelas ferramentas do agent quanto pelos botões da interface.
// As regras do Anexo A ficam aqui, no código: o modelo escolhe a ação, mas não consegue pular a regra.

export const IMPACT_LABEL: Record<Impact, string> = {
  individual: 'Somente você',
  equipe: 'A equipe',
  empresa: 'Toda a empresa',
}

export function describeDue(dueAt: Date, now: Date): string {
  if (isSameLocalDay(dueAt, now)) return `até ${formatLocalTime(dueAt)}`
  return `até ${formatLocalDate(dueAt)}, ${formatLocalTime(dueAt)}`
}

export function describeAge(since: Date, now: Date): string {
  const hours = businessHoursBetween(since, now)
  const days = Math.floor((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000))
  if (days >= 1) return days === 1 ? 'há 1 dia' : `há ${days} dias`
  if (hours >= 1) return `há ${Math.floor(hours)} h`
  return 'há poucos minutos'
}

export type DraftInput = PriorityFactors & {
  title: string
  description: string
  category: Category
}

export type DraftResult =
  | { kind: 'draft'; draft: DraftView }
  | { kind: 'duplicate'; ticket: TicketView; reopen: boolean }

/** Monta o rascunho: classifica a prioridade, calcula o prazo e checa duplicidade. Não cria nada. */
export async function prepareCreateDraft(turn: TurnContext, input: DraftInput): Promise<DraftResult> {
  const existing = await recordStep(turn, 'consultar_chamados', { motivo: 'checar duplicidade' }, async () => {
    const list = await turn.tickets.listByRequester(turn.employee.id)
    return { output: list, label: `consultou ${list.length} chamados para evitar duplicidade`, chips: ['verificou duplicidade'] }
  })

  const duplicate = findDuplicate(input, existing, turn.now)
  if (duplicate.kind !== 'none') {
    return { kind: 'duplicate', ticket: toTicketView(duplicate.ticket, turn.now), reopen: duplicate.kind === 'reopen' }
  }

  const decision = await recordStep(turn, 'classificar_prioridade', input, async () => {
    const d = classifyPriority(input)
    return { output: d, label: `prioridade ${d.priority}: ${d.rule}`, chips: ['classificou a prioridade'] }
  })

  const dueAt = await recordStep(turn, 'consultar_sla', { prioridade: decision.priority }, async () => {
    const due = computeDueAt(decision.priority, turn.now)
    return {
      output: due,
      label: `prazo de ${SLA_LABEL[decision.priority]}: resposta ${describeDue(due, turn.now)}`,
      chips: ['consultou o SLA'],
    }
  })

  const draft = await turn.store.createDraft(turn.conversationId, {
    kind: 'create',
    targetTicketId: null,
    type: input.type,
    title: input.title,
    description: input.description,
    category: input.category,
    priority: decision.priority,
    priorityRule: decision.rule,
    affected: input.impact,
    dueAt: dueAt.toISOString(),
    slaLabel: SLA_LABEL[decision.priority],
  })
  return { kind: 'draft', draft }
}

/** Rascunho para complementar um chamado aberto ou reabrir um resolvido há até 7 dias. */
export async function prepareUpdateDraft(turn: TurnContext, ticketId: string, note: string): Promise<DraftView> {
  const ticket = await turn.tickets.get(ticketId, turn.employee.id)
  if (!ticket) throw new Error(`O chamado ${ticketId} não existe ou não é deste funcionário.`)
  const open = isOpen(ticket)
  if (!open && !canReopen(ticket, turn.now)) {
    throw new Error(`O ${ticket.id} foi encerrado há mais de 7 dias e não pode ser reaberto; abra um chamado novo.`)
  }
  const dueAt = computeDueAt(ticket.priority, turn.now)
  return turn.store.createDraft(turn.conversationId, {
    kind: open ? 'update' : 'reopen',
    targetTicketId: ticket.id,
    type: ticket.type,
    title: ticket.title,
    description: note,
    category: ticket.category,
    priority: ticket.priority,
    priorityRule: open ? 'mantida do chamado' : 'reabertura mantém a prioridade',
    affected: ticket.affected,
    dueAt: dueAt.toISOString(),
    slaLabel: SLA_LABEL[ticket.priority],
  })
}

export type ConfirmResult = { ticket: Ticket; draft: DraftView; text: string }

/** Cria/atualiza o chamado de um rascunho confirmado. Só roda por confirmação explícita do funcionário. */
export async function confirmDraft(turn: TurnContext, draftId: string): Promise<ConfirmResult> {
  const draft = await turn.store.getDraft(draftId, turn.conversationId)
  if (!draft) throw new Error('Rascunho não encontrado nesta conversa.')
  if (draft.status !== 'pending') throw new Error(`O rascunho ${draft.id} já foi ${draft.status === 'confirmed' ? 'confirmado' : 'cancelado'}.`)

  const ticket = await recordStep(turn, 'gravar_chamado', { rascunho: draft.id }, async () => {
    if (draft.kind === 'create') {
      const created = await turn.tickets.create({
        type: draft.type,
        title: draft.title,
        description: draft.description,
        category: draft.category,
        subcategory: null,
        priority: draft.priority,
        requesterId: turn.employee.id,
        affected: draft.affected,
      })
      return { output: created, label: `criou o ${created.id}`, chips: [`criou o ${created.id}`] }
    }
    const target = draft.targetTicketId ?? ''
    const changed =
      draft.kind === 'reopen'
        ? await turn.tickets.reopen(target, turn.employee.id, draft.description)
        : await turn.tickets.addInformation(target, turn.employee.id, draft.description)
    const verb = draft.kind === 'reopen' ? 'reabriu' : 'atualizou'
    return { output: changed, label: `${verb} o ${changed.id}`, chips: [`${verb} o ${changed.id}`] }
  })

  // se outra aba confirmou no meio do caminho, não grava de novo
  const settled = await turn.store.settleDraft(draft.id, turn.conversationId, 'confirmed', ticket.id)
  const finalDraft: DraftView = { ...draft, status: settled ? 'confirmed' : draft.status, ticketId: ticket.id }
  await turn.store.refreshDraftBlocks(turn.conversationId, finalDraft)
  await turn.store.setTicket(turn.conversationId, ticket.id)

  const due = computeDueAt(ticket.priority, ticket.updatedAt)
  const text =
    draft.kind === 'create'
      ? `Pronto: abri o ${ticket.id} com prioridade ${ticket.priority.toLowerCase()}. Um analista responde ${describeDue(due, turn.now)}.`
      : draft.kind === 'reopen'
        ? `Reabri o ${ticket.id} com a sua informação. O prazo de resposta volta a contar: ${describeDue(due, turn.now)}.`
        : `Adicionei a informação ao ${ticket.id}. O prazo da próxima resposta é ${describeDue(due, turn.now)}.`
  return { ticket, draft: finalDraft, text }
}

export async function cancelDraft(turn: TurnContext, draftId: string): Promise<DraftView> {
  const draft = await turn.store.getDraft(draftId, turn.conversationId)
  if (!draft) throw new Error('Rascunho não encontrado nesta conversa.')
  await turn.store.settleDraft(draft.id, turn.conversationId, 'cancelled', null)
  const cancelled: DraftView = { ...draft, status: 'cancelled' }
  await turn.store.refreshDraftBlocks(turn.conversationId, cancelled)
  return cancelled
}

/** Mostra um chamado com o prazo calculado. Se estiver vencido, a regra manda oferecer um analista. */
export async function lookupTicket(turn: TurnContext, ticketId: string): Promise<{ view: TicketView; ticket: Ticket }> {
  return recordStep(turn, 'consultar_chamado', { chamado: ticketId }, async () => {
    const ticket = await turn.tickets.get(ticketId, turn.employee.id)
    if (!ticket) throw new Error(`O chamado ${ticketId} não existe ou não é deste funcionário.`)
    const view = toTicketView(ticket, turn.now)
    return {
      output: { view, ticket },
      label: `${ticket.id}: ${ticket.status}, prioridade ${ticket.priority}${view.overdue ? ', prazo vencido' : ''}`,
      chips: [`consultou o ${ticket.id}`, 'calculou o prazo'],
    }
  })
}

export function overdueMessage(view: TicketView, now: Date): string {
  const age = describeAge(new Date(view.updatedAt), now)
  return `Está sem atualização ${age}, acima do prazo de ${view.slaLabel} para prioridade ${view.priority.toLowerCase()}. Quer que eu chame um analista?`
}

export const OVERDUE_OPTIONS = ['Falar com um analista', 'Adicionar informação', 'Não, obrigado']

export function statusMessage(view: TicketView, now: Date): string {
  if (!view.open) return `O ${view.id} está ${view.status.toLowerCase()}.`
  if (view.overdue) return overdueMessage(view, now)
  const due = view.dueAt ? describeDue(new Date(view.dueAt), now) : null
  return `O ${view.id} está "${view.status}". ${due ? `A próxima atualização deve sair ${due}.` : ''}`.trim()
}

/** Transfere a conversa para a fila dos analistas. Depois disso o agent não responde mais. */
export async function handOff(
  turn: TurnContext,
  input: { kind: Handoff['kind']; reason: string; summary: string; ticketId: string | null; confidence: number | null },
): Promise<{ handoff: Handoff; level: 'N1' | 'N2'; text: string }> {
  return recordStep(turn, 'transferir_para_analista', input, async () => {
    let ticket: Ticket | null = null
    if (input.ticketId) {
      ticket = await turn.tickets.get(input.ticketId, turn.employee.id)
      if (ticket && isOpen(ticket)) {
        await turn.tickets.markTransferred(ticket.id, turn.employee.id, `Conversa transferida: ${input.reason}`)
      }
    }
    // N2 recebe o que já passou do prazo ou é crítico; o resto vai para o N1
    const level = input.kind === 'critico' || input.kind === 'vencido' || ticket?.priority === 'Crítica' ? 'N2' : 'N1'
    const handoff: Handoff = {
      kind: input.kind,
      reason: input.reason,
      summary: input.summary,
      confidence: input.confidence,
      at: turn.now.toISOString(),
    }
    await turn.store.handOff(turn.conversationId, handoff, ticket?.id ?? null)
    turn.handoff = handoff
    const when = input.kind === 'critico' ? 'em até 1 hora (plantão 24 h)' : 'em até 2 h úteis'
    return {
      output: { handoff, level, text: `Encaminhei para o Suporte ${level}. Um analista vai falar com você ${when}.` },
      label: `transferiu para o Suporte ${level}: ${input.reason}`,
      chips: ['chamou um analista'],
    }
  })
}

