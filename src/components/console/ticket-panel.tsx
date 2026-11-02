'use client'

import { ChevronRight, History } from 'lucide-react'
import type { ConsoleDetail } from '@/server/console'
import { formatDay, formatTime } from '@/lib/format'
import { Dot, StatusLabel } from '../ui'

export function TicketPanel({ detail }: { detail: ConsoleDetail }) {
  const { tickets, conversation, employee, ticketsError } = detail
  const firstName = employee.name.split(' ')[0] ?? employee.name
  const current = tickets.find((t) => t.id === conversation.ticketId) ?? null
  const others = tickets.filter((t) => t.id !== current?.id)
  const open = tickets.filter((t) => t.open).length

  return (
    <aside className="hidden w-[340px] shrink-0 flex-col border-l border-rule bg-paper xl:flex" aria-label={`Chamados de ${firstName}`}>
      <header className="flex h-16 shrink-0 flex-col justify-center border-b border-rule px-5">
        <h2 className="text-[15.5px] font-semibold">Chamados de {firstName}</h2>
        <p className="text-[12.5px] text-ink-3">
          {open} {open === 1 ? 'aberto' : 'abertos'} · {tickets.length - open} {tickets.length - open === 1 ? 'encerrado' : 'encerrados'}
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-5 py-6">
        {ticketsError && <p className="rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">{ticketsError}</p>}
        {current && (
          <section className="flex flex-col gap-3">
            <h3 className="text-[12.5px] font-semibold text-ink-3">Desta conversa</h3>
            <div className="flex flex-col gap-3.5 rounded-xl bg-desk p-4">
              <div className="flex flex-col gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-data text-[12px] font-medium text-ink-3">{current.id}</span>
                  <StatusLabel status={current.status} strong />
                </div>
                <p className="text-[15.5px] font-semibold">{current.title}</p>
                <p className="text-[13.5px] text-ink-3">
                  {current.category} · prioridade {current.priority.toLowerCase()}
                  {current.overdue && <span className="font-medium text-warning-text"> · prazo vencido</span>}
                </p>
              </div>
              <p className="flex items-center gap-2 border-t border-rule pt-3 text-[13.5px] text-ink-2">
                <History className="size-[15px] text-ink-3" aria-hidden />
                <span className="flex-1">
                  {conversation.status === 'analyst'
                    ? `Assumido por ${conversation.assignedAnalyst?.name}`
                    : conversation.status === 'waiting'
                      ? 'Transferido para um analista'
                      : `Atualizado em ${formatDay(current.updatedAt)}`}
                </span>
                <span className="text-[12.5px] text-ink-3">{formatTime(conversation.handoff?.at ?? current.updatedAt)}</span>
              </p>
            </div>
          </section>
        )}
        <section className="flex flex-col gap-1">
          <h3 className="text-[12.5px] font-semibold text-ink-3">{current ? 'Outros chamados' : 'Chamados'}</h3>
          {others.length === 0 && <p className="py-3 text-[13.5px] text-ink-3">Nenhum outro chamado.</p>}
          <ul>
            {others.map((t, i) => (
              <li key={t.id} className={`flex items-center gap-3 py-3 ${i < others.length - 1 ? 'border-b border-rule' : ''}`}>
                <Dot className={t.open ? (t.overdue ? 'bg-warning' : 'bg-primary') : 'bg-ink/25'} size={7} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-medium">{t.title}</span>
                  <span className="block text-[12.5px] text-ink-3">
                    {t.id} · {t.open ? t.status : `${t.status} em ${formatDay(t.resolvedAt ?? t.updatedAt)}`}
                    {t.overdue ? ' · vencido' : ''}
                  </span>
                </span>
                <ChevronRight className="size-4 text-ink-3" aria-hidden />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </aside>
  )
}
