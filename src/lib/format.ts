// Formatação de datas no fuso de Brasília, segura para rodar no navegador.
const TZ = 'America/Sao_Paulo'

const time = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, hour: '2-digit', minute: '2-digit' })
const dayMonth = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: 'short' })
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })

export function formatTime(iso: string): string {
  return time.format(new Date(iso))
}

export function formatDay(iso: string): string {
  return dayMonth.format(new Date(iso)).replace('.', '').replace(' de ', ' ')
}

export function formatDayTime(iso: string): string {
  return `${formatDay(iso)}, ${formatTime(iso)}`
}

export function isToday(iso: string, now = new Date()): boolean {
  return dayKey.format(new Date(iso)) === dayKey.format(now)
}

/** "10:05" hoje, "ontem" ou "16 out" — como na lista de conversas do protótipo. */
export function formatListTime(iso: string, now = new Date()): string {
  if (isToday(iso, now)) return formatTime(iso)
  const yesterday = new Date(now.getTime() - 86_400_000)
  if (dayKey.format(new Date(iso)) === dayKey.format(yesterday)) return 'ontem'
  return formatDay(iso)
}

export function relativeAge(iso: string, now = new Date()): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'há 1 dia' : `há ${days} dias`
}

export function formatDue(iso: string, now = new Date()): string {
  return isToday(iso, now) ? `até ${formatTime(iso)}` : `até ${formatDayTime(iso)}`
}
