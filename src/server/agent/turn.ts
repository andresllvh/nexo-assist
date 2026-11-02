import { RequestContext } from '@mastra/core/request-context'
import { formatLocalTime } from '@/domain/business-time'
import type { Employee } from '@/domain/types'
import { MESSAGE_LIMIT, type Block, type Decision, type StreamEvent, type Trace } from '@/shared/chat'
import { getApp } from '../app'
import type { ConversationRow } from '../conversations/store'
import { searchArticles } from '../helpcenter/search'
import { toTicketView } from '../views'
import { createTurnContext, errorMessage, recordStep, type TurnContext } from './context'
import type { Prefetch } from './nexo-agent'
import { toModelMessages, transcript } from './history'
import { createNexoAgent } from './nexo-agent'
import {
  cancelDraft,
  confirmDraft,
  handOff,
  lookupTicket,
  OVERDUE_OPTIONS,
  statusMessage,
} from './operations'
import { createRouter, routerPrompt, routerSchema, type RouterOutput } from './router'

export type TurnInput =
  | { kind: 'message'; text: string }
  | { kind: 'confirm_draft'; draftId: string }
  | { kind: 'cancel_draft'; draftId: string }
  | { kind: 'select_ticket'; ticketId: string }

/** Abaixo disso o agent não decide sozinho: chama um analista. */
export const MIN_CONFIDENCE = 0.4

const MODEL = process.env.NEXO_MODEL ?? 'google/gemini-3.5-flash'
// entender a mensagem é uma tarefa simples: um modelo menor custa menos e tem cota separada
const ROUTER_MODEL = process.env.NEXO_ROUTER_MODEL ?? 'google/gemini-3.5-flash-lite'

let agent: ReturnType<typeof createNexoAgent> | null = null
let router: ReturnType<typeof createRouter> | null = null

type Outcome = { text: string; decision: Decision; path: Trace['path']; usage: Trace['usage'] }

export class TurnRejectedError extends Error {}

/**
 * Uma resposta do Nexo Assist. Ações de botão (confirmar, cancelar, escolher chamado) são resolvidas
 * no código, sem chamar o modelo. Texto livre passa pela etapa de entendimento e depois pelo agent.
 */
export async function runTurn(args: {
  employee: Employee
  conversationId: string
  input: TurnInput
  emit: (event: StreamEvent) => void
}): Promise<void> {
  const app = await getApp()
  const { employee, input, emit } = args
  let conversation = await app.conversations.getForEmployee(args.conversationId, employee.id)
  if (!conversation) throw new TurnRejectedError('Conversa não encontrada')
  if (conversation.status === 'closed') conversation = await app.conversations.create(employee.id)

  if ((await app.conversations.countEmployeeMessages(conversation.id)) >= MESSAGE_LIMIT) {
    throw new TurnRejectedError(`Você chegou ao limite de ${MESSAGE_LIMIT} mensagens desta sessão. Comece uma nova conversa.`)
  }

  const turn = createTurnContext({ employee, conversationId: conversation.id, store: app.conversations, rawTickets: app.tickets, emit })
  const employeeText = await describeInput(turn, input)
  const employeeMessage = await app.conversations.addMessage({
    conversationId: conversation.id,
    author: 'employee',
    authorId: employee.id,
    text: employeeText,
  })
  emit({ type: 'message', message: employeeMessage })

  // com um analista na conversa, o agent fica calado: a mensagem só vai para a fila
  if (conversation.status === 'waiting' || conversation.status === 'analyst') {
    emit({ type: 'conversation', conversation: await app.conversations.view(conversation) })
    return
  }

  const started = Date.now()
  let outcome: Outcome
  try {
    outcome = await decideAndAct(turn, conversation, input, employeeText)
  } catch (error) {
    console.error('[turn]', error)
    outcome = failureOutcome(turn, employeeText, error)
  }

  const trace: Trace = {
    decision: outcome.decision,
    steps: turn.steps,
    path: outcome.path,
    model: outcome.path === 'agent' ? MODEL : null,
    usage: outcome.usage,
    ms: Date.now() - started,
  }
  const reply = await app.conversations.addMessage({
    conversationId: conversation.id,
    author: 'agent',
    authorId: null,
    text: outcome.text,
    blocks: turn.blocks,
    trace,
  })
  emit({ type: 'message', message: reply })

  if (turn.handoff) {
    const system = await app.conversations.addMessage({
      conversationId: conversation.id,
      author: 'system',
      authorId: null,
      text: `Transferida para um analista · ${formatLocalTime(new Date(turn.handoff.at))}`,
    })
    emit({ type: 'message', message: system })
  }
  const fresh = await app.conversations.get(conversation.id)
  if (fresh) emit({ type: 'conversation', conversation: await app.conversations.view(fresh) })
}

/**
 * Falha do modelo (ex.: limite de uso) ou do legado não derruba a conversa. Se o agent já tinha mostrado
 * algo útil (uma pergunta com opções, um cartão), a resposta aproveita isso em vez de descartar.
 */
function failureOutcome(turn: TurnContext, understood: string, error: unknown): Outcome {
  const question = turn.blocks.find((b) => b.kind === 'options')
  const partial = turn.blocks.length > 0
  const limit = /quota|rate limit|429/i.test(error instanceof Error ? `${error.message} ${String((error as { cause?: unknown }).cause ?? '')}` : String(error))
  if (!partial) turn.blocks.push({ kind: 'options', question: null, options: ['Tentar de novo', 'Falar com um analista'] })
  return {
    text:
      question?.kind === 'options' && question.question
        ? question.question
        : partial
          ? 'Confira acima. Se precisar, me diga como continuar.'
          : limit
            ? 'O assistente atingiu o limite de uso do modelo agora. Tente de novo em instantes ou fale com um analista.'
            : 'Tive um problema para concluir agora. Pode tentar de novo em alguns segundos? Se for urgente, posso chamar um analista.',
    decision: {
      intent: 'conversa',
      understood,
      action: partial ? 'concluiu só parte da resposta' : 'não concluiu por erro técnico',
      confidence: 0,
      reason: limit ? 'o provedor do modelo recusou a chamada por limite de uso (cota)' : errorMessage(error),
    },
    path: 'regra',
    usage: null,
  }
}

async function describeInput(turn: TurnContext, input: TurnInput): Promise<string> {
  switch (input.kind) {
    case 'message':
      return input.text.trim()
    case 'confirm_draft':
      return 'Confirmar'
    case 'cancel_draft':
      return 'Cancelar'
    case 'select_ticket': {
      const ticket = await turn.tickets.get(input.ticketId, turn.employee.id).catch(() => null)
      return ticket ? `${ticket.id} · ${ticket.title}` : input.ticketId
    }
  }
}

async function decideAndAct(turn: TurnContext, conversation: ConversationRow, input: TurnInput, text: string): Promise<Outcome> {
  if (input.kind === 'confirm_draft') return confirmOutcome(turn, input.draftId, 'clicou em Confirmar no rascunho')
  if (input.kind === 'cancel_draft') return cancelOutcome(turn, input.draftId, 'clicou em Cancelar no rascunho')
  if (input.kind === 'select_ticket') return selectOutcome(turn, input.ticketId)

  const history = await turn.store.messages(conversation.id, 30)
  const pending = await turn.store.pendingDraft(conversation.id)
  const route = await understand(turn, history, text, pending ? `${pending.id}: ${pending.title}` : null)

  if (route.confianca < MIN_CONFIDENCE) {
    return handOffOutcome(turn, route, 'baixa_confianca', history)
  }
  if (route.intencao === 'falar_com_analista') return handOffOutcome(turn, route, 'pedido', history)
  if (route.intencao === 'confirmar' && pending) return confirmOutcome(turn, pending.id, route.motivo, route)
  if (route.intencao === 'cancelar' && pending) return cancelOutcome(turn, pending.id, route.motivo, route)

  return agentOutcome(turn, history, route)
}

/** Etapa de entendimento (modelo com saída estruturada). */
async function understand(turn: TurnContext, history: Awaited<ReturnType<TurnContext['store']['messages']>>, text: string, pendingDraft: string | null): Promise<RouterOutput> {
  router ??= createRouter(ROUTER_MODEL)
  const started = Date.now()
  const result = await router.generate(routerPrompt({ transcript: transcript(history.slice(0, -1)), lastMessage: text, pendingDraft }), {
    structuredOutput: { schema: routerSchema },
    modelSettings: { temperature: 0 },
    providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } },
  })
  const route = result.object as RouterOutput
  const decision: Decision = {
    intent: route.intencao,
    understood: route.entendimento,
    action: '',
    confidence: route.confianca,
    reason: route.motivo,
  }
  turn.emit({ type: 'decision', decision })
  turn.steps.push({
    id: `step_route_${started}`,
    tool: 'entender_mensagem',
    label: `entendeu: ${route.entendimento}`,
    chips: [],
    status: 'ok',
    input: { mensagem: text },
    output: route,
    retries: 0,
    ms: Date.now() - started,
  })
  return route
}

async function agentOutcome(turn: TurnContext, history: Awaited<ReturnType<TurnContext['store']['messages']>>, route: RouterOutput): Promise<Outcome> {
  agent ??= createNexoAgent(MODEL)
  const requestContext = new RequestContext()
  requestContext.set('turn', turn)
  requestContext.set('route', route)
  requestContext.set('prefetch', await prefetch(turn, route, history.at(-1)?.text ?? ''))

  const stream = await agent.stream(toModelMessages(history), {
    requestContext,
    maxSteps: 4,
    // o Gemini 3.x "pensa" antes de responder e esse raciocínio conta no limite de saída;
    // num atendimento as decisões são simples, então pensar pouco deixa a resposta mais rápida e barata
    modelSettings: { temperature: 0.2, maxOutputTokens: 2048 },
    providerOptions: { google: { thinkingConfig: { thinkingLevel: 'low' } } },
  })
  let text = ''
  for await (const chunk of stream.fullStream) {
    if (chunk.type === 'text-delta') {
      text += chunk.payload.text
      turn.emit({ type: 'text', delta: chunk.payload.text })
    } else if (chunk.type === 'error') {
      throw chunk.payload.error instanceof Error ? chunk.payload.error : new Error(String(chunk.payload.error))
    }
  }
  const usage = await stream.usage
  const fallback = turn.handoff ? 'Vou chamar um analista para continuar com você.' : 'Pronto.'
  return {
    text: text.trim() || fallback,
    decision: {
      intent: route.intencao,
      understood: route.entendimento,
      action: describeAction(turn),
      confidence: route.confianca,
      reason: route.motivo,
    },
    path: 'agent',
    usage: { inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0 },
  }
}

/**
 * Dados que o agent quase sempre precisa, buscados no código antes de chamar o modelo.
 * Cada ferramenta que o modelo chama custa uma ida e volta; entregar isso pronto corta passos (e custo).
 */
async function prefetch(turn: TurnContext, route: RouterOutput, text: string): Promise<Prefetch> {
  const tickets = await recordStep(turn, 'consultar_chamados', { motivo: 'contexto da resposta' }, async () => {
    const list = (await turn.tickets.listByRequester(turn.employee.id)).map((t) => toTicketView(t, turn.now))
    const relevant = list.filter((t) => t.open || (t.resolvedAt && turn.now.getTime() - Date.parse(t.resolvedAt) <= 7 * 86_400_000))
    const shown = ['consultar_chamado', 'complementar_chamado', 'abrir_chamado'].includes(route.intencao)
    return { output: relevant, label: `${relevant.length} chamados abertos ou resolvidos há até 7 dias`, chips: shown ? ['consultou seus chamados'] : [] }
  })
  const wantsArticles = route.intencao === 'duvida' || route.intencao === 'abrir_chamado'
  const articles = wantsArticles
    ? await recordStep(turn, 'buscar_central_de_ajuda', { consulta: text }, async () => {
        const hits = searchArticles(text)
        return {
          output: hits.map((h) => h.article),
          label: hits.length ? `encontrou ${hits.map((h) => h.article.id).join(', ')}` : 'nenhum artigo encontrado',
          chips: ['buscou na central de ajuda'],
        }
      })
    : []
  return { tickets, articles }
}

/** Resume a ação tomada a partir dos passos executados, para o painel de decisão. */
export function describeAction(turn: Pick<TurnContext, 'blocks' | 'handoff' | 'steps'>): string {
  if (turn.handoff) return 'transferiu a conversa para um analista'
  const has = (kind: Block['kind']) => turn.blocks.some((b) => b.kind === kind)
  const draft = turn.blocks.find((b) => b.kind === 'draft')
  if (draft?.kind === 'draft') return `montou o rascunho ${draft.draft.id} e pediu confirmação`
  if (has('ticket_card')) return 'mostrou o chamado com o prazo'
  if (has('ticket_selector')) return 'pediu para escolher o chamado'
  if (has('options')) return 'fez uma pergunta para completar as informações'
  if (turn.steps.some((s) => s.tool === 'buscar_central_de_ajuda')) return 'respondeu com base na central de ajuda'
  if (turn.steps.some((s) => s.status === 'error')) return 'avisou que não conseguiu concluir'
  return 'respondeu sem usar ferramentas'
}

async function confirmOutcome(turn: TurnContext, draftId: string, reason: string, route?: RouterOutput): Promise<Outcome> {
  const result = await confirmDraft(turn, draftId)
  turn.blocks.push({ kind: 'ticket_card', ticket: (await lookupTicket(turn, result.ticket.id)).view })
  let text = result.text
  // regra do Anexo A: caso crítico vai direto para um analista
  if (result.ticket.priority === 'Crítica') {
    const transfer = await handOff(turn, {
      kind: 'critico',
      reason: 'chamado crítico: algo parado para uma equipe ou para a empresa',
      summary: `${result.ticket.id} — ${result.ticket.title}. ${result.ticket.description}`,
      ticketId: result.ticket.id,
      confidence: null,
    })
    text = `${text} Como é crítico, já ${transfer.text.charAt(0).toLowerCase()}${transfer.text.slice(1)}`
  }
  return {
    text,
    decision: {
      intent: 'confirmar',
      understood: route?.entendimento ?? `confirmou o rascunho ${draftId}`,
      action: `${result.draft.kind === 'create' ? 'criou' : result.draft.kind === 'reopen' ? 'reabriu' : 'atualizou'} o ${result.ticket.id}`,
      confidence: route?.confianca ?? 1,
      reason,
    },
    path: route ? 'agent' : 'regra',
    usage: null,
  }
}

async function cancelOutcome(turn: TurnContext, draftId: string, reason: string, route?: RouterOutput): Promise<Outcome> {
  const draft = await cancelDraft(turn, draftId)
  return {
    text: `Cancelei o rascunho ${draft.id}. Nada foi criado. Se quiser, me conte de outro jeito o que está acontecendo.`,
    decision: {
      intent: 'cancelar',
      understood: route?.entendimento ?? `cancelou o rascunho ${draft.id}`,
      action: `cancelou o rascunho ${draft.id}`,
      confidence: route?.confianca ?? 1,
      reason,
    },
    path: route ? 'agent' : 'regra',
    usage: null,
  }
}

async function selectOutcome(turn: TurnContext, ticketId: string): Promise<Outcome> {
  const { view } = await lookupTicket(turn, ticketId)
  // o chamado escolhido passa a ser o assunto da conversa (vai junto se ela for transferida)
  await turn.store.setTicket(turn.conversationId, view.id)
  turn.blocks.push({ kind: 'ticket_card', ticket: view })
  if (view.overdue) turn.blocks.push({ kind: 'options', question: null, options: OVERDUE_OPTIONS })
  return {
    text: statusMessage(view, turn.now),
    decision: {
      intent: 'consultar_chamado',
      understood: `quer saber do ${view.id}`,
      action: view.overdue ? 'mostrou o chamado vencido e ofereceu um analista' : 'mostrou o chamado com o prazo',
      confidence: 1,
      reason: 'escolheu o chamado na lista',
    },
    path: 'regra',
    usage: null,
  }
}

async function handOffOutcome(
  turn: TurnContext,
  route: RouterOutput,
  initialKind: 'pedido' | 'baixa_confianca',
  history: Awaited<ReturnType<TurnContext['store']['messages']>>,
): Promise<Outcome> {
  let kind: 'pedido' | 'baixa_confianca' | 'vencido' = initialKind
  const conversation = await turn.store.get(turn.conversationId)
  const ticketId = route.chamado ?? conversation?.ticketId ?? null
  // pedido de analista sobre um chamado vencido conta como "vencido": vai para o N2
  if (kind === 'pedido' && ticketId) {
    const ticket = await turn.tickets.get(ticketId, turn.employee.id).catch(() => null)
    if (ticket && toTicketView(ticket, turn.now).overdue) kind = 'vencido'
  }
  const recent = history
    .filter((m) => m.author === 'employee')
    .slice(-4)
    .map((m) => `"${m.text}"`)
    .join(' · ')
  const summary = `${route.entendimento}.${ticketId ? ` Chamado: ${ticketId}.` : ''} Últimas mensagens: ${recent}`
  const reason =
    kind === 'pedido'
      ? 'o funcionário pediu para falar com um analista'
      : kind === 'vencido'
        ? `o funcionário pediu um analista e o ${ticketId} está com o prazo vencido`
        : `o agent não teve segurança para decidir (confiança ${Math.round(route.confianca * 100)}%)`
  const result = await handOff(turn, { kind, reason, summary, ticketId, confidence: route.confianca })
  return {
    text: kind === 'baixa_confianca' ? `Não tenho certeza de como ajudar com isso, então vou chamar uma pessoa. ${result.text}` : result.text,
    decision: {
      intent: route.intencao,
      understood: route.entendimento,
      action: `transferiu para o Suporte ${result.level}`,
      confidence: route.confianca,
      reason,
    },
    path: 'regra',
    usage: null,
  }
}
