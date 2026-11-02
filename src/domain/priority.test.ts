import { describe, expect, it } from 'vitest'
import { addBusinessDays, addBusinessHours, businessHoursBetween, nextBusinessMoment } from './business-time'
import { classifyPriority, computeDueAt, slaStatus } from './priority'

// 02/11/2026 é uma segunda-feira
const at = (iso: string) => new Date(`${iso}-03:00`)

describe('classifyPriority', () => {
  it('crítica quando algo parou para uma equipe', () => {
    const r = classifyPriority({ type: 'INC', impact: 'equipe', workStopped: true, sameDayCommitment: false })
    expect(r.priority).toBe('Crítica')
  })

  it('alta quando há compromisso no mesmo dia, mesmo afetando só uma pessoa', () => {
    const r = classifyPriority({ type: 'INC', impact: 'individual', workStopped: false, sameDayCommitment: true })
    expect(r.priority).toBe('Alta')
  })

  it('alta quando impede uma pessoa de trabalhar', () => {
    const r = classifyPriority({ type: 'INC', impact: 'individual', workStopped: true, sameDayCommitment: false })
    expect(r.priority).toBe('Alta')
  })

  it('média quando atrapalha mas há alternativa', () => {
    const r = classifyPriority({ type: 'INC', impact: 'individual', workStopped: false, sameDayCommitment: false })
    expect(r.priority).toBe('Média')
  })

  it('baixa para pedidos sem urgência', () => {
    const r = classifyPriority({ type: 'REQ', impact: 'individual', workStopped: false, sameDayCommitment: false })
    expect(r.priority).toBe('Baixa')
  })
})

describe('horário útil', () => {
  it('fora do expediente, o relógio começa às 8h do próximo dia útil', () => {
    expect(nextBusinessMoment(at('2026-10-31T10:00'))).toEqual(at('2026-11-02T08:00')) // sábado → segunda
    expect(nextBusinessMoment(at('2026-11-02T19:30'))).toEqual(at('2026-11-03T08:00'))
  })

  it('4 horas úteis atravessam a noite', () => {
    expect(addBusinessHours(at('2026-11-02T16:00'), 4)).toEqual(at('2026-11-03T10:00'))
  })

  it('3 dias úteis pulam o fim de semana', () => {
    expect(addBusinessDays(at('2026-11-05T10:00'), 3)).toEqual(at('2026-11-10T10:00')) // quinta → terça
  })

  it('conta só horas de expediente entre duas datas', () => {
    expect(businessHoursBetween(at('2026-11-02T17:00'), at('2026-11-03T09:00'))).toBe(2)
  })
})

describe('prazo e vencimento', () => {
  it('crítica vale 1 hora corrida, inclusive de madrugada', () => {
    expect(computeDueAt('Crítica', at('2026-11-02T23:00'))).toEqual(at('2026-11-03T00:00'))
  })

  it('média vence 3 dias úteis depois da última atualização', () => {
    const ticket = { priority: 'Média' as const, status: 'Aguardando analista' as const, updatedAt: at('2026-10-27T10:00') }
    const sla = slaStatus(ticket, at('2026-11-02T10:00'))
    expect(sla?.dueAt).toEqual(at('2026-10-30T10:00'))
    expect(sla?.overdue).toBe(true)
  })

  it('chamado resolvido não tem prazo', () => {
    const ticket = { priority: 'Alta' as const, status: 'Resolvido' as const, updatedAt: at('2026-10-27T10:00') }
    expect(slaStatus(ticket, at('2026-11-02T10:00'))).toBeNull()
  })
})
