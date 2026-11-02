import { createTool } from '@mastra/core/tools'
import type { RequestContext } from '@mastra/core/request-context'
import type { z } from 'zod'
import type { Employee } from '@/domain/types'
import type { Block, Handoff, StreamEvent, TraceStep } from '@/shared/chat'
import type { ConversationStore } from '../conversations/store'
import { newId } from '../db'
import { resilient } from '../tickets/resilient'
import type { TicketService } from '../tickets/service'
import { TicketNotFoundError, TicketServiceUnavailableError } from '../tickets/service'

/**
 * Tudo que uma resposta precisa saber. Vai para as ferramentas pelo RequestContext do Mastra,
 * nunca pelos argumentos do modelo: assim o modelo não consegue "trocar" de funcionário.
 */
export type TurnContext = {
  employee: Employee
  conversationId: string
  now: Date
  store: ConversationStore
  tickets: TicketService
  blocks: Block[]
  steps: TraceStep[]
  emit: (event: StreamEvent) => void
  /** preenchido quando a conversa vai para um analista nesta resposta */
  handoff: Handoff | null
  /** passo em execução, para contar as novas tentativas do legado */
  current: TraceStep | null
}

export type TurnRequestContext = { turn: TurnContext }

export function createTurnContext(input: {
  employee: Employee
  conversationId: string
  store: ConversationStore
  rawTickets: TicketService
  emit: (event: StreamEvent) => void
  now?: Date
}): TurnContext {
  const turn: TurnContext = {
    employee: input.employee,
    conversationId: input.conversationId,
    now: input.now ?? new Date(),
    store: input.store,
    tickets: input.rawTickets,
    blocks: [],
    steps: [],
    emit: input.emit,
    handoff: null,
    current: null,
  }
  turn.tickets = resilient(input.rawTickets, {
    delaysMs: [300, 800],
    onRetry: () => {
      if (turn.current) turn.current.retries++
    },
  })
  return turn
}

export function turnFrom(requestContext: RequestContext | undefined): TurnContext {
  const turn = requestContext?.get('turn') as TurnContext | undefined
  if (!turn) throw new Error('Ferramenta chamada fora de uma resposta do Nexo Assist')
  return turn
}

/** Executa um passo registrando duração, novas tentativas e resultado no trace. */
export async function recordStep<T>(
  turn: TurnContext,
  tool: string,
  input: unknown,
  run: () => Promise<{ output: T; label: string; chips: string[] }>,
): Promise<T> {
  const started = Date.now()
  const step: TraceStep = { id: newId('step'), tool, label: '', chips: [], status: 'ok', input, output: null, retries: 0, ms: 0 }
  turn.current = step
  try {
    const result = await run()
    step.output = result.output
    step.label = result.label
    step.chips = result.chips
    return result.output
  } catch (error) {
    step.status = 'error'
    step.label = `falhou: ${tool}`
    step.chips = [errorChip(error)]
    step.output = { erro: errorMessage(error) }
    throw error
  } finally {
    step.ms = Date.now() - started
    turn.current = null
    turn.steps.push(step)
    turn.emit({ type: 'step', step })
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof TicketServiceUnavailableError) {
    return 'O sistema de chamados está fora do ar agora (tentei 3 vezes). Peça para o funcionário tentar de novo em alguns segundos.'
  }
  if (error instanceof TicketNotFoundError) return 'Chamado não encontrado entre os chamados deste funcionário.'
  return error instanceof Error ? error.message : 'Erro inesperado'
}

function errorChip(error: unknown): string {
  return error instanceof TicketServiceUnavailableError ? 'sistema de chamados fora do ar' : 'não conseguiu concluir uma ação'
}

type ToolSpec<S extends z.ZodType> = {
  id: string
  description: string
  inputSchema: S
  run: (input: z.infer<S>, turn: TurnContext) => Promise<{ output: Record<string, unknown>; label: string; chips: string[] }>
}

/**
 * Ferramenta do Mastra com registro automático no trace. Erros viram uma resposta para o modelo
 * ({ ok: false, erro }) em vez de derrubar a conversa.
 */
export function defineTool<S extends z.ZodType>(spec: ToolSpec<S>) {
  return createTool({
    id: spec.id,
    description: spec.description,
    inputSchema: spec.inputSchema,
    execute: async (input, context) => {
      const turn = turnFrom(context?.requestContext)
      try {
        const output = await recordStep(turn, spec.id, input, () => spec.run(input as z.infer<S>, turn))
        return { ok: true as const, ...output }
      } catch (error) {
        return { ok: false as const, erro: errorMessage(error) }
      }
    },
  })
}
