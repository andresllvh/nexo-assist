import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, migrate } from '../db'
import { seed } from '../seed'
import { ConversationStore } from './store'

let store: ConversationStore

beforeEach(async () => {
  const db = createDb('file::memory:')
  await migrate(db)
  await seed(db)
  store = new ConversationStore(db)
})

describe('ConversationStore', () => {
  it('retoma a última conversa não encerrada', async () => {
    const first = await store.resumeOrCreate('e-ana')
    await store.addMessage({ conversationId: first.id, author: 'employee', authorId: 'e-ana', text: 'oi' })
    const again = await store.resumeOrCreate('e-ana')
    expect(again.id).toBe(first.id)

    await store.close(first.id)
    const fresh = await store.resumeOrCreate('e-ana')
    expect(fresh.id).not.toBe(first.id)
  })

  it('não entrega conversa de outro funcionário', async () => {
    const conv = await store.create('e-ana')
    expect(await store.getForEmployee(conv.id, 'e-carla')).toBeNull()
  })

  it('rascunho só pode ser confirmado uma vez', async () => {
    const conv = await store.create('e-ana')
    const draft = await store.createDraft(conv.id, {
      kind: 'create',
      targetTicketId: null,
      type: 'INC',
      title: 'VPN',
      description: 'erro 809',
      category: 'Rede e VPN',
      priority: 'Alta',
      priorityRule: 'compromisso hoje',
      affected: 'individual',
      dueAt: new Date().toISOString(),
      slaLabel: '4 horas úteis',
    })
    expect(draft.id).toBe('D-381')
    expect(await store.settleDraft(draft.id, conv.id, 'confirmed', 'INC-1')).toBe(true)
    expect(await store.settleDraft(draft.id, conv.id, 'confirmed', 'INC-2')).toBe(false)
  })

  it('transferência muda o estado e guarda o resumo', async () => {
    const conv = await store.create('e-ana')
    await store.handOff(
      conv.id,
      { kind: 'pedido', reason: 'pediu', summary: 'resumo', confidence: null, at: new Date().toISOString() },
      'INC-20311',
    )
    const view = await store.view((await store.get(conv.id))!)
    expect(view.status).toBe('waiting')
    expect(view.ticketId).toBe('INC-20311')
    expect(view.handoff?.summary).toBe('resumo')
  })
})
