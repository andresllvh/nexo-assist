'use client'

import { Bot, CheckCheck, ChevronDown, Hand, Lock, MessageSquareWarning, RotateCcw, SendHorizontal, XCircle } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ConsoleDetail } from '@/server/console'
import type { MessageView } from '@/shared/chat'
import { INTENT_LABEL } from '@/shared/chat'
import { formatTime } from '@/lib/format'
import { DecisionPanel } from '../chat/decision-panel'
import { cx, Spinner } from '../ui'
import type { Analyst } from './console-app'
import { avatarTone } from './console-app'

const HANDOFF_KIND = {
  pedido: 'Funcionário pediu um analista',
  critico: 'Caso crítico',
  vencido: 'Chamado com prazo vencido',
  baixa_confianca: 'Agent sem segurança para decidir',
} as const

export function ConversationPane({
  detail,
  analyst,
  busy,
  error,
  onAssume,
  onReturn,
  onClose,
  onSend,
}: {
  detail: ConsoleDetail
  analyst: Analyst
  busy: string | null
  error: string | null
  onAssume: () => void
  onReturn: () => void
  onClose: () => void
  onSend: (text: string) => Promise<boolean>
}) {
  const { conversation, employee } = detail
  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const mine = conversation.status === 'analyst' && conversation.assignedAnalyst?.id === analyst.id
  const firstName = employee.name.split(' ')[0] ?? employee.name

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [conversation.id, conversation.messages.length])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const value = text.trim()
    if (!value) return
    if (await onSend(value)) setText('')
  }

  const mode =
    conversation.status === 'waiting'
      ? { tone: 'bg-warning-soft text-warning-text', icon: MessageSquareWarning, label: 'Aguardando atendente' }
      : conversation.status === 'analyst'
        ? { tone: 'bg-primary-soft text-primary-text', icon: Hand, label: mine ? 'Você está atendendo' : `Com ${conversation.assignedAnalyst?.name}` }
        : conversation.status === 'agent'
          ? { tone: 'bg-success-soft text-success-text', icon: Bot, label: 'Agent atendendo' }
          : { tone: 'bg-desk text-ink-3', icon: XCircle, label: 'Encerrada' }

  return (
    <section className="flex min-w-0 flex-1 flex-col bg-console" aria-label={`Conversa com ${employee.name}`}>
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper pr-4 pl-5">
        <span className={cx('grid size-10 place-items-center rounded-full text-[14.5px] font-semibold', avatarTone(employee.id))}>{employee.initials}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15.5px] font-semibold">{employee.name}</span>
          <span className="block truncate text-[12.5px] text-ink-3">
            {employee.department}
            {conversation.ticketId ? ` · ${conversation.ticketId}` : ''} · {employee.email}
          </span>
        </span>
        <span className={cx('inline-flex items-center gap-[7px] rounded-full px-[11px] py-1.5 text-[12.5px] font-semibold', mode.tone)}>
          <mode.icon className="size-3.5" aria-hidden />
          {mode.label}
        </span>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-4 lg:px-10">
        {conversation.handoff && conversation.status !== 'agent' && (
          <aside className="mb-4 rounded-xl border border-warning/30 bg-paper p-4 text-[13.5px]">
            <p className="mb-1 flex flex-wrap items-center gap-2 font-semibold">
              {HANDOFF_KIND[conversation.handoff.kind]}
              {conversation.handoff.confidence !== null && (
                <span className="rounded-md bg-warning-soft px-1.5 py-px text-[11.5px] text-warning-text">
                  confiança {Math.round(conversation.handoff.confidence * 100)}%
                </span>
              )}
              <span className="text-[12px] font-normal text-ink-3">· {formatTime(conversation.handoff.at)}</span>
            </p>
            <p className="text-ink-2">
              <span className="font-medium text-ink">Motivo:</span> {conversation.handoff.reason}
            </p>
            <p className="mt-1 text-ink-2">
              <span className="font-medium text-ink">Resumo do agent:</span> {conversation.handoff.summary}
            </p>
          </aside>
        )}
        <ol className="flex flex-col">
          {conversation.messages.map((m, i) => (
            <ConsoleMessage key={m.id} message={m} previous={conversation.messages[i - 1]} analystLevel={analyst.level} />
          ))}
        </ol>
        <div ref={endRef} />
      </div>

      <footer className="flex flex-col gap-2.5 border-t border-rule bg-paper px-5 pt-3 pb-3.5">
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
            {error}
          </p>
        )}
        {conversation.status === 'closed' ? (
          <p className="text-[13.5px] text-ink-3">Conversa encerrada. Se o funcionário escrever de novo, uma nova conversa começa com o agent.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <span className={cx('grid size-9 shrink-0 place-items-center rounded-full', conversation.status === 'waiting' ? 'bg-warning-soft text-warning-text' : 'bg-desk text-ink-2')}>
              {conversation.status === 'waiting' ? <MessageSquareWarning className="size-[17px]" /> : mine ? <Hand className="size-[17px]" /> : <Bot className="size-[17px]" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14.5px] font-semibold">
                {conversation.status === 'waiting'
                  ? `${firstName} espera um atendente`
                  : mine
                    ? `Você está atendendo ${firstName}`
                    : conversation.status === 'analyst'
                      ? `${conversation.assignedAnalyst?.name} está atendendo`
                      : 'O agent está atendendo'}
              </span>
              <span className="block text-[12.5px] text-ink-3">
                {conversation.status === 'agent' ? 'Você pode assumir se quiser intervir' : 'Agent pausado'}
              </span>
            </span>
            {conversation.status !== 'agent' && (
              <button
                type="button"
                onClick={onReturn}
                disabled={busy !== null}
                className="flex h-9 items-center gap-[7px] rounded-lg border border-line px-3.5 text-[13.5px] font-medium text-ink-2 hover:bg-desk disabled:opacity-60"
              >
                {busy === 'return' ? <Spinner /> : <RotateCcw className="size-[15px]" aria-hidden />}
                Devolver ao agent
              </button>
            )}
            {mine ? (
              <button
                type="button"
                onClick={onClose}
                disabled={busy !== null}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-danger-soft px-3 text-[13.5px] font-semibold text-danger-text hover:bg-danger/15 disabled:opacity-60"
              >
                {busy === 'close' ? <Spinner /> : <XCircle className="size-[15px]" aria-hidden />}
                Encerrar atendimento
              </button>
            ) : (
              conversation.status !== 'analyst' && (
                <button
                  type="button"
                  onClick={onAssume}
                  disabled={busy !== null}
                  className="flex h-9 items-center gap-[7px] rounded-lg bg-cta px-4 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-60"
                >
                  {busy === 'assume' ? <Spinner /> : <Hand className="size-4" aria-hidden />}
                  Assumir atendimento
                </button>
              )
            )}
          </div>
        )}
        {conversation.status !== 'closed' &&
          (mine ? (
            <form onSubmit={submit} className="flex h-11 items-center gap-2 rounded-xl border border-line pr-1 pl-3.5 focus-within:border-cta">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={`Escreva para ${firstName}…`}
                aria-label="Mensagem para o funcionário"
                className="flex-1 bg-transparent text-[14.5px] outline-none placeholder:text-ink-3"
              />
              <button
                type="submit"
                disabled={!text.trim() || busy !== null}
                className="grid size-9 place-items-center rounded-lg bg-cta text-white disabled:opacity-50"
                aria-label="Enviar"
              >
                {busy === 'message' ? <Spinner /> : <SendHorizontal className="size-4" />}
              </button>
            </form>
          ) : (
            <p className="flex h-11 items-center gap-2 rounded-xl bg-desk px-3.5 text-[14.5px] text-ink-3">
              <Lock className="size-4" aria-hidden /> Assuma o atendimento para responder
            </p>
          ))}
      </footer>
    </section>
  )
}

function ConsoleMessage({ message, previous, analystLevel }: { message: MessageView; previous: MessageView | undefined; analystLevel: string }) {
  const [open, setOpen] = useState(false)
  const grouped = previous?.author === message.author
  if (message.author === 'system') {
    return (
      <li className="flex items-center gap-3 pt-[18px] pb-1 text-[12px] font-medium text-ink-3">
        <span className="h-px flex-1 bg-ink/10" />
        {message.text}
        <span className="h-px flex-1 bg-ink/10" />
      </li>
    )
  }
  const fromDesk = message.author !== 'employee'
  return (
    <li className={cx('flex flex-col gap-1', fromDesk ? 'items-end' : 'items-start', grouped ? 'pt-[3px]' : 'pt-4')}>
      {fromDesk && !grouped && (
        <p className="flex items-center gap-1.5 px-1 text-[12px]">
          <span className="font-semibold text-ink-2">{message.authorName}</span>
          <span className={cx('rounded-md px-1.5 py-px text-[11px] font-semibold', message.author === 'agent' ? 'bg-primary-soft text-primary-text' : 'bg-success-soft text-success-text')}>
            {message.author === 'agent' ? 'IA' : `Suporte ${analystLevel}`}
          </span>
          {message.trace && (
            <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="inline-flex items-center gap-0.5 text-primary-text hover:underline">
              {INTENT_LABEL[message.trace.decision.intent]} · {Math.round(message.trace.decision.confidence * 100)}%
              <ChevronDown className={cx('size-3', open && 'rotate-180')} />
            </button>
          )}
        </p>
      )}
      {open && message.trace && (
        <div className="w-full max-w-[560px]">
          <DecisionPanel trace={message.trace} />
        </div>
      )}
      <div
        className={cx(
          'flex max-w-[520px] flex-col gap-0.5 px-3 pt-2 pb-1.5 text-[14.5px] shadow-[0_1px_0_rgba(27,36,49,0.06)]',
          message.author === 'employee' && 'rounded-[4px_12px_12px_12px] bg-paper',
          message.author === 'agent' && 'rounded-[12px_4px_12px_12px] bg-agent-bubble',
          message.author === 'analyst' && 'rounded-[12px_4px_12px_12px] bg-[#DCF3E6]',
        )}
      >
        <span className="whitespace-pre-line">{message.text}</span>
        {message.blocks.length > 0 && (
          <span className="text-[12px] text-ink-3">
            {message.blocks
              .map((b) =>
                b.kind === 'ticket_card'
                  ? `cartão do ${b.ticket.id}`
                  : b.kind === 'draft'
                    ? `rascunho ${b.draft.id} (${b.draft.status === 'pending' ? 'pendente' : b.draft.status === 'confirmed' ? 'confirmado' : 'cancelado'})`
                    : b.kind === 'ticket_selector'
                      ? 'lista de chamados'
                      : `opções: ${b.options.join(' / ')}`,
              )
              .join(' · ')}
          </span>
        )}
        <span className="flex items-center justify-end gap-[3px] text-[11px] text-ink-3">
          {formatTime(message.createdAt)}
          {fromDesk && <CheckCheck className="size-3.5 text-primary" aria-hidden />}
        </span>
      </div>
    </li>
  )
}
