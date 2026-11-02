'use client'

import { Check } from 'lucide-react'
import type { DraftView, TicketView } from '@/shared/chat'
import { formatDay, formatDayTime, formatDue, relativeAge } from '@/lib/format'
import { cx, Dot, PriorityLabel, Spinner, StatusLabel } from '../ui'

const IMPACT: Record<DraftView['affected'], string> = {
  individual: 'Somente você',
  equipe: 'A equipe',
  empresa: 'Toda a empresa',
}

const card = 'w-full overflow-hidden rounded-2xl border border-ink/[0.09] bg-paper'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="text-[12.5px] text-ink-3">{label}</span>
      <span className="flex flex-wrap items-baseline gap-1.5 text-[14.5px] font-medium">{children}</span>
    </div>
  )
}

export function TicketSelector({
  tickets,
  selected,
  disabled,
  onSelect,
}: {
  tickets: TicketView[]
  selected: string | null
  disabled: boolean
  onSelect: (ticket: TicketView) => void
}) {
  return (
    <div className={card} role="radiogroup" aria-label="Escolha um chamado">
      {tickets.map((t, i) => {
        const isSelected = selected === t.id
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={disabled}
            onClick={() => onSelect(t)}
            className={cx(
              'flex h-[46px] w-full items-center gap-3.5 px-4 text-left transition-colors disabled:cursor-default',
              i > 0 && 'border-t border-rule',
              isSelected ? 'bg-cta/[0.04]' : 'enabled:hover:bg-desk',
            )}
          >
            <span className={cx('grid size-4 shrink-0 place-items-center rounded-full border', isSelected ? 'border-cta' : 'border-ink/20')}>
              {isSelected && <span className="size-2 rounded-full bg-cta" />}
            </span>
            <span className="w-[76px] shrink-0 font-data text-[12px] font-medium text-ink-3">{t.id}</span>
            <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium">{t.title}</span>
            <span className="hidden sm:inline">
              <StatusLabel status={t.status} />
            </span>
            <span className="w-11 shrink-0 text-right text-[12.5px] text-ink-3">{formatDay(t.createdAt)}</span>
          </button>
        )
      })}
    </div>
  )
}

export function TicketCard({ ticket }: { ticket: TicketView }) {
  return (
    <article className={card} aria-label={`Chamado ${ticket.id}`}>
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <span className="font-medium">Chamado</span>
          <Dot className="bg-rule" size={3} />
          <span className="font-data">{ticket.id}</span>
          <span className="flex-1" />
          <StatusLabel status={ticket.status} strong />
        </div>
        <h3 className="text-[18px] font-semibold leading-snug">{ticket.title}</h3>
        <p className="text-[13.5px] text-ink-2">{ticket.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-rule pt-3">
          <Field label="Categoria">
            {ticket.category}
            {ticket.subcategory ? ` › ${ticket.subcategory}` : ''}
          </Field>
          <Field label="Prioridade">
            <PriorityLabel priority={ticket.priority} />
          </Field>
          <Field label="Aberto em">{formatDayTime(ticket.createdAt)}</Field>
          <Field label="Última atualização">
            <span className={ticket.overdue ? 'text-warning-text' : ''}>{relativeAge(ticket.updatedAt)}</span>
            {ticket.overdue ? (
              <span className="text-[13.5px] font-normal text-ink-3">· prazo vencido</span>
            ) : ticket.dueAt ? (
              <span className="text-[13.5px] font-normal text-ink-3">· próxima {formatDue(ticket.dueAt)}</span>
            ) : null}
          </Field>
        </div>
      </div>
    </article>
  )
}

const DRAFT_KIND: Record<DraftView['kind'], string> = {
  create: 'Novo chamado',
  update: 'Complemento',
  reopen: 'Reabertura',
}

export function DraftCard({
  draft,
  busy,
  onConfirm,
  onEdit,
  onCancel,
}: {
  draft: DraftView
  busy: 'confirm' | 'cancel' | null
  onConfirm: () => void
  onEdit: () => void
  onCancel: () => void
}) {
  const pending = draft.status === 'pending'
  const state =
    draft.status === 'pending'
      ? { dot: 'bg-warning', text: 'text-warning-text', label: 'Aguardando confirmação' }
      : draft.status === 'confirmed'
        ? { dot: 'bg-success', text: 'text-success-text', label: draft.ticketId ? `Confirmado · ${draft.ticketId}` : 'Confirmado' }
        : { dot: 'bg-ink/25', text: 'text-ink-3', label: 'Cancelado' }

  return (
    <article className={cx(card, !pending && 'opacity-90')} aria-label={`Rascunho ${draft.id}`}>
      <div className="flex flex-col gap-1.5 px-[18px] pt-4 pb-3.5">
        <div className="flex items-center gap-2 pb-0.5 text-[12.5px] text-ink-3">
          <span className="font-medium">
            {DRAFT_KIND[draft.kind]}
            {draft.targetTicketId ? ` do ${draft.targetTicketId}` : ''}
          </span>
          <Dot className="bg-rule" size={3} />
          <span>Rascunho {draft.id}</span>
          <span className="flex-1" />
          <span className={cx('inline-flex items-center gap-1.5 font-medium', state.text)}>
            <Dot className={state.dot} />
            {state.label}
          </span>
        </div>
        <h3 className="text-[18px] font-semibold leading-snug">{draft.title}</h3>
        <p className="text-[13.5px] text-ink-2">{draft.description}</p>
      </div>
      <div className="px-[18px] pb-4">
        <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-rule pt-3">
          <Field label="Categoria">{draft.category}</Field>
          <Field label="Prioridade">
            <PriorityLabel priority={draft.priority} />
            <span className="text-[13.5px] font-normal text-ink-3">· resposta {formatDue(draft.dueAt)}</span>
          </Field>
          <Field label="Afetados">{IMPACT[draft.affected]}</Field>
        </div>
        <p className="mt-2 text-[12.5px] text-ink-3">
          Tipo {draft.type === 'INC' ? 'incidente (INC)' : 'requisição (REQ)'} · prioridade {draft.priority.toLowerCase()} porque{' '}
          {draft.priorityRule} · prazo de {draft.slaLabel}
        </p>
      </div>
      {pending && (
        <div className="flex items-center gap-1.5 border-t border-rule bg-desk py-2 pr-3.5 pl-2">
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy !== null}
            className="flex h-9 items-center gap-2 rounded-lg bg-cta pr-2.5 pl-3.5 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-60"
          >
            {busy === 'confirm' ? <Spinner /> : <Check className="size-4" />}
            Confirmar
            <kbd className="rounded-md bg-white/15 px-1.5 py-px font-ui text-[11.5px] text-white/80">⌘↵</kbd>
          </button>
          <button
            type="button"
            onClick={onEdit}
            disabled={busy !== null}
            className="h-9 rounded-lg border border-line bg-paper px-3.5 text-[13.5px] font-medium hover:bg-desk disabled:opacity-60"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy !== null}
            className="flex h-9 items-center gap-2 rounded-lg px-3.5 text-[13.5px] font-medium text-ink-2 hover:bg-paper disabled:opacity-60"
          >
            {busy === 'cancel' && <Spinner />}
            Cancelar
          </button>
        </div>
      )}
    </article>
  )
}

export function Options({
  options,
  question,
  active,
  disabled,
  onPick,
}: {
  options: string[]
  question: string | null
  active: boolean
  disabled: boolean
  onPick: (option: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {question && <p className="text-[14.5px] font-semibold">{question}</p>}
      <div className="flex flex-wrap gap-1.5">
        {options.map((option, i) => (
          <button
            key={option}
            type="button"
            disabled={disabled}
            onClick={() => onPick(option)}
            className="flex items-center gap-[7px] rounded-lg border border-rule bg-paper px-3 py-[7px] text-[13.5px] font-medium enabled:hover:border-primary enabled:hover:bg-primary-soft enabled:hover:text-primary-text disabled:opacity-60"
          >
            {active && (
              <kbd className="grid size-4 place-items-center rounded-md bg-desk font-ui text-[11.5px] text-ink-3">{i + 1}</kbd>
            )}
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
