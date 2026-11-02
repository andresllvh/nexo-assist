import { describe, expect, it } from 'vitest'
import { canReopen, findDuplicate } from './duplicates'
import type { Ticket } from './types'

const now = new Date('2026-11-02T12:00:00-03:00')
const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000)

function ticket(partial: Partial<Ticket>): Ticket {
  return {
    id: 'INC-1',
    type: 'INC',
    title: '',
    description: '',
    category: 'Hardware',
    subcategory: null,
    priority: 'Média',
    status: 'Aberto',
    requesterId: 'e-ana',
    affected: 'individual',
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    resolvedAt: null,
    ...partial,
  }
}

describe('findDuplicate', () => {
  const notebook = ticket({
    id: 'INC-20311',
    title: 'Notebook lento após atualização do Windows',
    description: 'Lentidão geral desde a atualização de 15/10.',
  })

  it('encontra chamado aberto sobre o mesmo problema', () => {
    const r = findDuplicate(
      { title: 'Notebook muito lento', description: 'ficou lento depois da atualização do Windows', category: 'Hardware' },
      [notebook],
      now,
    )
    expect(r.kind).toBe('open')
  })

  it('não considera duplicado se a categoria é outra', () => {
    const r = findDuplicate(
      { title: 'Notebook lento na VPN', description: 'atualização', category: 'Rede e VPN' },
      [notebook],
      now,
    )
    expect(r.kind).toBe('none')
  })

  it('sugere reabrir chamado resolvido há até 7 dias', () => {
    const sap = ticket({
      id: 'INC-20150',
      category: 'Acesso',
      title: 'Senha do SAP bloqueada',
      description: 'Senha bloqueada após tentativas',
      status: 'Resolvido',
      resolvedAt: daysAgo(4),
    })
    const r = findDuplicate({ title: 'SAP bloqueou minha senha de novo', description: '', category: 'Acesso' }, [sap], now)
    expect(r.kind).toBe('reopen')
  })
})

describe('canReopen', () => {
  it('só reabre resolvidos nos últimos 7 dias', () => {
    expect(canReopen({ status: 'Resolvido', resolvedAt: daysAgo(6) }, now)).toBe(true)
    expect(canReopen({ status: 'Resolvido', resolvedAt: daysAgo(8) }, now)).toBe(false)
    expect(canReopen({ status: 'Fechado', resolvedAt: daysAgo(1) }, now)).toBe(false)
  })
})
