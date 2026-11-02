'use client'

import { Check, ChevronDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import type { Block, Decision, DraftView, MessageView, TicketView, TraceStep } from '@/shared/chat'
import { INTENT_LABEL } from '@/shared/chat'
import { cx } from '../ui'
import { DraftCard, Options, TicketCard, TicketSelector } from './blocks'
import { ConfidenceMeter, DecisionPanel } from './decision-panel'

export type BlockHandlers = {
  /** só a última mensagem do agent aceita interação (opções, escolha de chamado) */
  interactive: boolean
  busy: boolean
  draftBusy: { id: string; kind: 'confirm' | 'cancel' } | null
  selectedTicket: string | null
  onOption: (option: string) => void
  onSelectTicket: (ticket: TicketView) => void
  onConfirmDraft: (draft: DraftView) => void
  onCancelDraft: (draft: DraftView) => void
  onEditDraft: (draft: DraftView) => void
}

function chipsFrom(steps: TraceStep[]): { label: string; failed: boolean }[] {
  const seen = new Set<string>()
  const chips: { label: string; failed: boolean }[] = []
  for (const step of steps) {
    for (const label of step.chips) {
      if (seen.has(label)) continue
      seen.add(label)
      chips.push({ label, failed: step.status === 'error' })
    }
  }
  return chips
}

function StatusLine({
  steps,
  decision,
  working,
  expanded,
  onToggle,
}: {
  steps: TraceStep[]
  decision: Decision | null
  working: boolean
  expanded: boolean
  onToggle: (() => void) | null
}) {
  const chips = chipsFrom(steps)
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
      <span className="font-semibold text-ink">Nexo Assist</span>
      {chips.map((chip) => (
        <span key={chip.label} className={cx('inline-flex items-center gap-[5px]', chip.failed ? 'text-danger-text' : 'text-ink-3')}>
          <Check className="size-3" aria-hidden />
          {chip.label}
        </span>
      ))}
      {working && (
        <span className="inline-flex items-center gap-[5px] text-ink-3">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          {decision ? 'trabalhando…' : 'entendendo a mensagem…'}
        </span>
      )}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium text-primary-text hover:bg-primary-soft"
        >
          Como decidi
          <ChevronDown className={cx('size-3.5 transition-transform', expanded && 'rotate-180')} aria-hidden />
        </button>
      )}
    </div>
  )
}

const normalize = (text: string) => text.toLowerCase().replace(/\s+/g, ' ').trim()

function BlockView({ block, handlers, text }: { block: Block; handlers: BlockHandlers; text: string }) {
  switch (block.kind) {
    case 'ticket_selector':
      return (
        <TicketSelector
          tickets={block.tickets}
          selected={handlers.interactive ? handlers.selectedTicket : null}
          disabled={!handlers.interactive || handlers.busy}
          onSelect={handlers.onSelectTicket}
        />
      )
    case 'ticket_card':
      return <TicketCard ticket={block.ticket} />
    case 'draft':
      return (
        <DraftCard
          draft={block.draft}
          busy={handlers.draftBusy?.id === block.draft.id ? handlers.draftBusy.kind : null}
          onConfirm={() => handlers.onConfirmDraft(block.draft)}
          onCancel={() => handlers.onCancelDraft(block.draft)}
          onEdit={() => handlers.onEditDraft(block.draft)}
        />
      )
    case 'options':
      return (
        <div className="w-full max-w-[600px] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3">
          <Options
            options={block.options}
            // o agent costuma escrever a pergunta no texto também; não repete
            question={block.question && !normalize(text).includes(normalize(block.question)) ? block.question : null}
            active={handlers.interactive}
            disabled={!handlers.interactive || handlers.busy}
            onPick={handlers.onOption}
          />
        </div>
      )
  }
}

export function AgentMessage({ message, handlers }: { message: MessageView; handlers: BlockHandlers }) {
  const [expanded, setExpanded] = useState(false)
  const trace = message.trace
  return (
    <div className="flex flex-col items-start gap-1.5">
      <StatusLine
        steps={trace?.steps ?? []}
        decision={trace?.decision ?? null}
        working={false}
        expanded={expanded}
        onToggle={trace ? () => setExpanded((v) => !v) : null}
      />
      {expanded && trace && <DecisionPanel trace={trace} />}
      {message.text && (
        <p className="max-w-[600px] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-[14.5px] leading-relaxed whitespace-pre-line">
          {message.text}
        </p>
      )}
      {message.blocks.length > 0 && (
        <div className="flex w-full flex-col items-start gap-2">
          {message.blocks.map((block, i) => (
            <BlockView key={i} block={block} handlers={handlers} text={message.text} />
          ))}
        </div>
      )}
    </div>
  )
}

/** Resposta sendo montada em tempo real: entendimento, passos e texto chegando. */
export function LiveAgentMessage({ decision, steps, text }: { decision: Decision | null; steps: TraceStep[]; text: string }) {
  return (
    <div className="flex flex-col items-start gap-1.5" aria-live="polite">
      <StatusLine steps={steps} decision={decision} working expanded={false} onToggle={null} />
      {decision && (
        <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-3">
          Entendi: <span className="text-ink-2">{INTENT_LABEL[decision.intent]}</span>
          <ConfidenceMeter value={decision.confidence} />
        </p>
      )}
      {text ? (
        <p className="caret max-w-[600px] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-[14.5px] leading-relaxed whitespace-pre-line">
          {text}
        </p>
      ) : (
        <p className="typing flex gap-1 rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3.5" aria-label="Nexo está digitando">
          <span className="size-1.5 rounded-full bg-ink-3" />
          <span className="size-1.5 rounded-full bg-ink-3" />
          <span className="size-1.5 rounded-full bg-ink-3" />
        </p>
      )}
    </div>
  )
}

