import type { Priority, TicketStatus } from '@/domain/types'

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

const STATUS_DOT: Record<TicketStatus, string> = {
  Aberto: 'bg-primary',
  'Em andamento': 'bg-primary',
  'Aguardando analista': 'bg-warning',
  'Aguardando você': 'bg-violet',
  Aprovado: 'bg-success',
  Resolvido: 'bg-ink/25',
  Fechado: 'bg-ink/25',
}

const STATUS_TEXT: Record<TicketStatus, string> = {
  Aberto: 'text-primary-text',
  'Em andamento': 'text-primary-text',
  'Aguardando analista': 'text-warning-text',
  'Aguardando você': 'text-violet-text',
  Aprovado: 'text-success-text',
  Resolvido: 'text-ink-3',
  Fechado: 'text-ink-3',
}

const PRIORITY_DOT: Record<Priority, string> = {
  Crítica: 'bg-danger',
  Alta: 'bg-warning',
  Média: 'bg-ink/40',
  Baixa: 'bg-ink/20',
}

export function Dot({ className, size = 6 }: { className: string; size?: number }) {
  return <span aria-hidden className={cx('inline-block shrink-0 rounded-full', className)} style={{ width: size, height: size }} />
}

export function StatusLabel({ status, strong = false }: { status: TicketStatus; strong?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12.5px]">
      <Dot className={STATUS_DOT[status]} />
      <span className={strong ? cx('font-medium', STATUS_TEXT[status]) : 'text-ink-3'}>{status}</span>
    </span>
  )
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Dot className={PRIORITY_DOT[priority]} />
      <span className="text-[14.5px] font-medium text-ink">{priority}</span>
    </span>
  )
}

export function NexoMark({ size = 20, tone = 'blue' }: { size?: number; tone?: 'blue' | 'white' }) {
  const fill = tone === 'white' ? '#FFFFFF' : '#037AF6'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d="M3 4h6l6 10V4h6v16h-6L9 10v10H3z" fill={fill} />
    </svg>
  )
}

export function Spinner({ className = 'size-3.5' }: { className?: string }) {
  return (
    <svg className={cx('animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}
