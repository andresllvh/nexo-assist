import { describe, expect, it } from 'vitest'
import type { MessageView, TraceStep } from '@/shared/chat'
import { toModelMessages } from './history'
import { describeAction } from './turn'

const msg = (author: MessageView['author'], text: string, extra: Partial<MessageView> = {}): MessageView => ({
  id: Math.random().toString(36),
  author,
  authorName: author,
  text,
  blocks: [],
  trace: null,
  createdAt: new Date().toISOString(),
  ...extra,
})

describe('toModelMessages', () => {
  it('junta turnos seguidos do mesmo lado (o Gemini exige alternância)', () => {
    const result = toModelMessages([
      msg('employee', 'oi'),
      msg('agent', 'Olá!'),
      msg('system', 'Transferida para um analista'),
      msg('analyst', 'Oi, aqui é o Rafael', { authorName: 'Rafael Lima' }),
      msg('employee', 'obrigada'),
    ])
    expect(result.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(result[1]?.content).toContain('[analista Rafael Lima]: Oi, aqui é o Rafael')
  })

  it('descreve os cartões para o modelo saber o que apareceu na tela', () => {
    const [, agent] = toModelMessages([
      msg('employee', 'status?'),
      msg('agent', 'Veja:', {
        blocks: [{ kind: 'options', question: null, options: ['Falar com um analista', 'Não, obrigado'] }],
      }),
    ])
    expect(agent?.content).toContain('[opções: Falar com um analista / Não, obrigado]')
  })

  it('envia só as mensagens mais recentes', () => {
    const many = Array.from({ length: 30 }, (_, i) => msg(i % 2 ? 'agent' : 'employee', `m${i}`))
    expect(toModelMessages(many, 6)).toHaveLength(6)
  })
})

describe('describeAction', () => {
  const step = (tool: string, status: TraceStep['status'] = 'ok'): TraceStep => ({
    id: tool, tool, label: '', chips: [], status, input: null, output: null, retries: 0, ms: 0,
  })

  it('prioriza a transferência', () => {
    const handoff = { kind: 'pedido' as const, reason: '', summary: '', confidence: null, at: '' }
    expect(describeAction({ blocks: [], steps: [], handoff })).toBe('transferiu a conversa para um analista')
  })

  it('reconhece pergunta com opções e resposta só com a central de ajuda', () => {
    expect(describeAction({ blocks: [{ kind: 'options', question: 'Quem?', options: ['a', 'b'] }], steps: [], handoff: null })).toBe(
      'fez uma pergunta para completar as informações',
    )
    expect(describeAction({ blocks: [], steps: [step('buscar_central_de_ajuda')], handoff: null })).toBe(
      'respondeu com base na central de ajuda',
    )
  })
})
