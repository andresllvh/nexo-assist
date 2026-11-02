import { beforeEach, describe, expect, it } from 'vitest'
import { createDb, migrate } from '../db'
import { seed } from '../seed'
import { resilient, withRetry } from './resilient'
import { SqlTicketService, TicketNotFoundError, TicketServiceUnavailableError } from './service'

async function setup(failureRate = 0, random: () => number = Math.random) {
  const db = createDb('file::memory:')
  await migrate(db)
  await seed(db, new Date('2026-11-02T12:00:00-03:00'))
  return new SqlTicketService(db, { failureRate, random })
}

describe('privacidade', () => {
  let tickets: SqlTicketService
  beforeEach(async () => {
    tickets = await setup()
  })

  it('lista só os chamados de quem pergunta', async () => {
    const list = await tickets.listByRequester('e-ana')
    expect(list.length).toBe(6)
    expect(list.every((t) => t.requesterId === 'e-ana')).toBe(true)
  })

  it('não revela chamado de outro funcionário, nem que ele existe', async () => {
    expect(await tickets.get('INC-20322', 'e-ana')).toBeNull()
    expect(await tickets.get('INC-20322', 'e-carla')).not.toBeNull()
    await expect(tickets.addInformation('INC-20322', 'e-ana', 'oi')).rejects.toBeInstanceOf(TicketNotFoundError)
  })
})

describe('ciclo do chamado', () => {
  it('cria com número sequencial e registra evento', async () => {
    const tickets = await setup()
    const t = await tickets.create({
      type: 'INC',
      title: 'VPN não conecta',
      description: 'Erro 809',
      category: 'Rede e VPN',
      subcategory: null,
      priority: 'Alta',
      requesterId: 'e-ana',
      affected: 'individual',
    })
    expect(t.id).toBe('INC-20517')
    expect(t.status).toBe('Aberto')
    const events = await tickets.events(t.id, 'e-ana')
    expect(events.map((e) => e.kind)).toEqual(['criado'])
  })

  it('reabrir limpa a data de resolução', async () => {
    const tickets = await setup()
    const t = await tickets.reopen('INC-20150', 'e-ana', 'Bloqueou de novo')
    expect(t.status).toBe('Aberto')
    expect(t.resolvedAt).toBeNull()
  })
})

describe('legado instável', () => {
  it('tenta de novo quando o sistema cai e avisa cada nova tentativa', async () => {
    const results = [0, 0, 1] // falha, falha, sucesso
    const service = await setup(0.5, () => results.shift() ?? 1)
    const retries: number[] = []
    const client = resilient(service, { delaysMs: [1, 1], onRetry: (n) => retries.push(n) })
    const list = await client.listByRequester('e-ana')
    expect(list.length).toBe(6)
    expect(retries).toEqual([1, 2])
  })

  it('nova tentativa depois de falha não cria chamado duplicado', async () => {
    // falha só na 1ª chamada; se a gravação fizesse uma 2ª chamada ao legado, um retry duplicaria o chamado
    let calls = 0
    const service = await setup(0.5, () => (calls++ === 0 ? 0 : 1))
    const client = resilient(service, { delaysMs: [1, 1] })
    const ticket = await client.create({
      type: 'INC',
      title: 'Teams não abre',
      description: 'Fecha sozinho',
      category: 'Software',
      subcategory: null,
      priority: 'Média',
      requesterId: 'e-ana',
      affected: 'individual',
    })
    expect(ticket.id).toBe('INC-20517')
    const mine = await service.listByRequester('e-ana')
    expect(mine.filter((t) => t.title === 'Teams não abre')).toHaveLength(1)
    expect(calls).toBe(3) // falha + criação + listagem
  })

  it('desiste depois das tentativas e devolve o erro', async () => {
    const service = await setup(1)
    const client = resilient(service, { delaysMs: [1, 1] })
    await expect(client.listByRequester('e-ana')).rejects.toBeInstanceOf(TicketServiceUnavailableError)
  })

  it('não repete erro de negócio', async () => {
    let calls = 0
    await expect(
      withRetry(
        async () => {
          calls++
          throw new TicketNotFoundError('X')
        },
        { delaysMs: [1, 1] },
      ),
    ).rejects.toBeInstanceOf(TicketNotFoundError)
    expect(calls).toBe(1)
  })
})
