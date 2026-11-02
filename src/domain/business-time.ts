// Horário do service desk: segunda a sexta, das 8h às 18h (horário de Brasília).
// O Brasil não tem horário de verão desde 2019, então o fuso é fixo em UTC-3.
const OFFSET_MS = -3 * 60 * 60 * 1000
const OPEN_HOUR = 8
const CLOSE_HOUR = 18
const HOUR_MS = 60 * 60 * 1000

/** Converte para um Date cujos campos UTC representam a hora local de Brasília. */
function toLocal(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS)
}

function fromLocal(local: Date): Date {
  return new Date(local.getTime() - OFFSET_MS)
}

function isBusinessDay(local: Date): boolean {
  const day = local.getUTCDay()
  return day !== 0 && day !== 6
}

function atHour(local: Date, hour: number): Date {
  const d = new Date(local)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

/** Primeiro instante útil a partir de `date` (ele mesmo, se já estiver dentro do expediente). */
export function nextBusinessMoment(date: Date): Date {
  let local = toLocal(date)
  for (;;) {
    if (isBusinessDay(local)) {
      const open = atHour(local, OPEN_HOUR)
      const close = atHour(local, CLOSE_HOUR)
      if (local < open) return fromLocal(open)
      if (local < close) return fromLocal(local)
    }
    const next = atHour(local, OPEN_HOUR)
    next.setUTCDate(next.getUTCDate() + 1)
    local = next
  }
}

export function isBusinessTime(date: Date): boolean {
  return nextBusinessMoment(date).getTime() === date.getTime()
}

/** Soma horas contando só o expediente. */
export function addBusinessHours(start: Date, hours: number): Date {
  let remaining = hours * HOUR_MS
  let cursor = nextBusinessMoment(start)
  for (;;) {
    const close = fromLocal(atHour(toLocal(cursor), CLOSE_HOUR))
    const available = close.getTime() - cursor.getTime()
    if (remaining <= available) return new Date(cursor.getTime() + remaining)
    remaining -= available
    cursor = nextBusinessMoment(new Date(close.getTime() + 1))
  }
}

/** Soma dias úteis: mesmo horário, N dias úteis depois (10h de segunda + 3 dias úteis = 10h de quinta). */
export function addBusinessDays(start: Date, days: number): Date {
  const cursor = nextBusinessMoment(start)
  let local = toLocal(cursor)
  let added = 0
  while (added < days) {
    local = new Date(local.getTime() + 24 * HOUR_MS)
    if (isBusinessDay(local)) added++
  }
  return fromLocal(local)
}

/** Horas úteis entre duas datas (para mostrar "há 5 dias úteis" e afins). */
export function businessHoursBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  let total = 0
  let cursor = nextBusinessMoment(from)
  while (cursor < to) {
    const close = fromLocal(atHour(toLocal(cursor), CLOSE_HOUR))
    const end = close < to ? close : to
    total += end.getTime() - cursor.getTime()
    cursor = nextBusinessMoment(new Date(close.getTime() + 1))
  }
  return total / HOUR_MS
}

export function formatLocalTime(date: Date): string {
  const local = toLocal(date)
  const hh = String(local.getUTCHours()).padStart(2, '0')
  const mm = String(local.getUTCMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function formatLocalDate(date: Date): string {
  const local = toLocal(date)
  return `${String(local.getUTCDate()).padStart(2, '0')} ${MONTHS[local.getUTCMonth()]}`
}

export function isSameLocalDay(a: Date, b: Date): boolean {
  const la = toLocal(a)
  const lb = toLocal(b)
  return (
    la.getUTCFullYear() === lb.getUTCFullYear() &&
    la.getUTCMonth() === lb.getUTCMonth() &&
    la.getUTCDate() === lb.getUTCDate()
  )
}
