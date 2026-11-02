'use client'

import { ArrowUp, Headset, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { formatTime } from '@/lib/format'
import {
  MESSAGE_LIMIT,
  type ConversationView,
  type Decision,
  type DraftView,
  type MessageView,
  type StreamEvent,
  type TicketView,
  type TraceStep,
} from '@/shared/chat'
import { TopBar } from '../top-bar'
import { cx, Dot, Spinner } from '../ui'
import { AgentMessage, LiveAgentMessage, type BlockHandlers } from './agent-message'

type TurnInput =
  | { kind: 'message'; text: string }
  | { kind: 'confirm_draft'; draftId: string }
  | { kind: 'cancel_draft'; draftId: string }
  | { kind: 'select_ticket'; ticketId: string }

type Live = { decision: Decision | null; steps: TraceStep[]; text: string }

const POLL_MS = 3000

export function ChatApp({ firstName, initial }: { firstName: string; initial: ConversationView }) {
  const router = useRouter()
  // a conversa já vem do servidor (retomada ou nova), então a tela abre sem carregamento
  const [conversation, setConversation] = useState<ConversationView | null>(initial)
  const [live, setLive] = useState<Live | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [draftBusy, setDraftBusy] = useState<BlockHandlers['draftBusy']>(null)
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const busy = live !== null

  // com um analista na conversa, as respostas chegam por consulta periódica
  const status = conversation?.status
  const conversationId = conversation?.id
  useEffect(() => {
    if (!conversationId || (status !== 'waiting' && status !== 'analyst') || busy) return
    const timer = setInterval(async () => {
      const res = await fetch(`/api/conversation/${conversationId}`, { cache: 'no-store' }).catch(() => null)
      if (res?.ok) setConversation((await res.json()) as ConversationView)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [conversationId, status, busy])

  const messageCount = conversation?.messages.length ?? 0
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messageCount, live?.text, live?.steps.length])

  const send = useCallback(
    async (input: TurnInput, optimisticText: string) => {
      if (!conversation || busy) return
      setError(null)
      const tempId = `temp-${Date.now()}`
      const optimistic: MessageView = {
        id: tempId,
        author: 'employee',
        authorName: firstName,
        text: optimisticText,
        blocks: [],
        trace: null,
        createdAt: new Date().toISOString(),
      }
      setConversation((c) => (c ? { ...c, messages: [...c.messages, optimistic] } : c))
      const agentReplies = conversation.status === 'agent'
      if (agentReplies) setLive({ decision: null, steps: [], text: '' })

      let accepted = false
      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: conversation.id, input }),
        })
        if (res.status === 401) return router.replace('/entrar')
        if (!res.ok || !res.body) throw new Error('Não foi possível enviar. Tente de novo.')

        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
        let buffer = ''
        for (;;) {
          const { value, done } = await reader.read()
          if (done) break
          buffer += value
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            const event = JSON.parse(line) as StreamEvent
            if (event.type === 'message' && event.message.author === 'employee') accepted = true
            handleEvent(event, tempId)
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não foi possível enviar. Tente de novo.')
      } finally {
        setLive(null)
        setDraftBusy(null)
        if (!accepted) {
          // a mensagem não chegou ao servidor: tira da tela e devolve o texto para a caixa
          setConversation((c) => (c ? { ...c, messages: c.messages.filter((m) => m.id !== tempId) } : c))
          if (input.kind === 'message') setText(input.text)
        }
      }

      function handleEvent(event: StreamEvent, temp: string) {
        switch (event.type) {
          case 'message':
            setConversation((c) => {
              if (!c) return c
              const messages = c.messages.filter((m) => m.id !== temp && m.id !== event.message.id)
              return { ...c, messages: [...messages, event.message] }
            })
            if (event.message.author === 'agent') setLive(null)
            break
          case 'conversation':
            setConversation(event.conversation)
            break
          case 'decision':
            setLive((l) => (l ? { ...l, decision: event.decision } : l))
            break
          case 'step':
            setLive((l) => (l ? { ...l, steps: [...l.steps, event.step] } : l))
            break
          case 'text':
            setLive((l) => (l ? { ...l, text: l.text + event.delta } : l))
            break
          case 'error':
            setError(event.message)
            break
        }
      }
    },
    [busy, conversation, firstName, router],
  )

  const lastAgentIndex = useMemo(() => {
    const messages = conversation?.messages ?? []
    for (let i = messages.length - 1; i >= 0; i--) {
      const author = messages[i]?.author
      if (author === 'agent') return i
      if (author === 'employee' || author === 'analyst') return -1
    }
    return -1
  }, [conversation?.messages])

  const lastAgent = lastAgentIndex >= 0 ? conversation?.messages[lastAgentIndex] : undefined
  const activeOptions = lastAgent?.blocks.find((b) => b.kind === 'options')
  const pendingDraft = conversation?.messages
    .flatMap((m) => m.blocks)
    .map((b) => (b.kind === 'draft' ? b.draft : null))
    .filter((d): d is DraftView => d !== null && d.status === 'pending')
    .at(-1)

  const limitReached = (conversation?.userMessageCount ?? 0) >= MESSAGE_LIMIT
  const agentPaused = status === 'waiting' || status === 'analyst'
  const canType = !!conversation && !busy && !limitReached

  const handlers: Omit<BlockHandlers, 'interactive'> = {
    busy,
    draftBusy,
    selectedTicket,
    onOption: (option) => void send({ kind: 'message', text: option }, option),
    onSelectTicket: (ticket: TicketView) => {
      setSelectedTicket(ticket.id)
      void send({ kind: 'select_ticket', ticketId: ticket.id }, `${ticket.id} · ${ticket.title}`)
    },
    onConfirmDraft: (draft) => {
      setDraftBusy({ id: draft.id, kind: 'confirm' })
      void send({ kind: 'confirm_draft', draftId: draft.id }, 'Confirmar')
    },
    onCancelDraft: (draft) => {
      setDraftBusy({ id: draft.id, kind: 'cancel' })
      void send({ kind: 'cancel_draft', draftId: draft.id }, 'Cancelar')
    },
    onEditDraft: () => {
      setText('Quero mudar ')
      inputRef.current?.focus()
    },
  }

  // atalhos: 1–4 escolhem uma opção; ⌘/Ctrl+Enter confirma o rascunho pendente
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (busy) return
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && pendingDraft) {
        event.preventDefault()
        handlers.onConfirmDraft(pendingDraft)
        return
      }
      const typing = document.activeElement === inputRef.current && text.length > 0
      if (activeOptions?.kind === 'options' && !typing && /^[1-4]$/.test(event.key) && !event.metaKey && !event.ctrlKey) {
        const option = activeOptions.options[Number(event.key) - 1]
        if (option) {
          event.preventDefault()
          handlers.onOption(option)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  function submit(event?: FormEvent) {
    event?.preventDefault()
    const value = text.trim()
    if (!value || !canType) return
    setText('')
    void send({ kind: 'message', text: value }, value)
  }

  async function newConversation() {
    const res = await fetch('/api/conversation', { method: 'POST' })
    if (res.ok) {
      setConversation((await res.json()) as ConversationView)
      setError(null)
    }
  }

  const statusPill =
    status === 'analyst'
      ? { tone: 'bg-primary-soft text-primary-text', dot: 'bg-primary', label: `Com ${conversation?.assignedAnalyst?.name ?? 'um analista'}` }
      : status === 'waiting'
        ? { tone: 'bg-warning-soft text-warning-text', dot: 'bg-warning', label: 'Aguardando analista' }
        : { tone: 'bg-success-soft text-success-text', dot: 'bg-success', label: 'Assistente online' }

  return (
    <>
      <TopBar
        here="Atendimento"
        status={
          <span className={cx('inline-flex items-center gap-[7px] rounded-full px-2.5 py-[5px] text-[12.5px] font-semibold', statusPill.tone)}>
            <Dot className={statusPill.dot} size={7} />
            {statusPill.label}
          </span>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[1040px] flex-col gap-5 px-5 pt-7 pb-2 md:px-10 xl:px-[120px]">
            {conversation && conversation.messages.length === 0 && <Welcome firstName={firstName} onPick={(t) => void send({ kind: 'message', text: t }, t)} />}
            {conversation?.messages.map((message, index) => (
              <MessageRow
                key={message.id}
                message={message}
                handlers={{ ...handlers, interactive: index === lastAgentIndex && !agentPaused }}
              />
            ))}
            {live && <LiveAgentMessage decision={live.decision} steps={live.steps} text={live.text} />}
            <div ref={endRef} />
          </div>
        </div>

        <div className="mx-auto w-full max-w-[1040px] px-5 pt-2.5 pb-[18px] md:px-10 xl:px-[120px]">
          {agentPaused && (
            <p className="mb-2 flex items-center gap-2 rounded-lg bg-warning-soft px-3 py-2 text-[13px] text-warning-text">
              <Headset className="size-4 shrink-0" aria-hidden />
              {status === 'analyst'
                ? `${conversation?.assignedAnalyst?.name ?? 'Um analista'} está atendendo você. O Nexo Assist está pausado.`
                : 'Um analista vai continuar esta conversa. Pode escrever: sua mensagem já chega para ele.'}
            </p>
          )}
          {error && (
            <p role="alert" className="mb-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger-text">
              {error}
            </p>
          )}
          <form
            onSubmit={submit}
            className="flex min-h-12 items-end gap-2 rounded-xl border border-line bg-paper py-1.5 pr-1.5 pl-4 focus-within:border-cta focus-within:ring-2 focus-within:ring-cta/15"
          >
            <label htmlFor="composer" className="sr-only">
              Mensagem para o Nexo
            </label>
            <textarea
              id="composer"
              ref={inputRef}
              rows={1}
              value={text}
              disabled={!canType}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
                  e.preventDefault()
                  submit()
                }
              }}
              placeholder={limitReached ? 'Limite de mensagens atingido' : agentPaused ? 'Escreva para o analista…' : 'Escreva para o Nexo…'}
              className="max-h-40 min-h-9 flex-1 resize-none bg-transparent py-2 text-[14.5px] outline-none placeholder:text-ink-3 disabled:cursor-not-allowed"
            />
            <button
              type="submit"
              disabled={!canType || !text.trim()}
              className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-cta px-3 text-[13.5px] font-semibold text-white hover:bg-cta-hover disabled:opacity-50"
            >
              {busy ? <Spinner /> : <ArrowUp className="size-3.5" aria-hidden />}
              Enviar
            </button>
          </form>
          <div className="mt-1.5 flex items-center justify-between text-[12.5px] text-ink-3">
            <span>
              {conversation?.userMessageCount ?? 0}/{MESSAGE_LIMIT} mensagens nesta sessão
            </span>
            {(limitReached || status === 'agent') && (conversation?.messages.length ?? 0) > 0 && (
              <button type="button" onClick={newConversation} disabled={busy} className="inline-flex items-center gap-1 font-medium text-primary-text hover:underline">
                <Plus className="size-3.5" aria-hidden /> Nova conversa
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

function MessageRow({ message, handlers }: { message: MessageView; handlers: BlockHandlers }) {
  if (message.author === 'agent') return <AgentMessage message={message} handlers={handlers} />
  if (message.author === 'system') {
    return (
      <p className="flex items-center gap-3 py-1 text-[12px] font-medium text-ink-3">
        <span className="h-px flex-1 bg-ink/10" />
        {message.text}
        <span className="h-px flex-1 bg-ink/10" />
      </p>
    )
  }
  if (message.author === 'analyst') {
    return (
      <div className="flex flex-col items-start gap-1.5">
        <p className="text-[12.5px]">
          <span className="font-semibold">{message.authorName}</span>
          <span className="ml-2 rounded-md bg-success-soft px-1.5 py-px text-[11px] font-semibold text-success-text">Analista</span>
          <span className="ml-2 text-ink-3">{formatTime(message.createdAt)}</span>
        </p>
        <p className="max-w-[600px] rounded-[4px_12px_12px_12px] border border-rule bg-paper px-4 py-3 text-[14.5px] leading-relaxed whitespace-pre-line">
          {message.text}
        </p>
      </div>
    )
  }
  return (
    <div className="flex justify-end">
      <p
        className={cx(
          'max-w-[520px] rounded-[12px_12px_4px_12px] bg-ink px-4 py-[11px] text-[14.5px] leading-relaxed whitespace-pre-line text-white',
          message.id.startsWith('temp-') && 'opacity-80',
        )}
      >
        {message.text}
      </p>
    </div>
  )
}

const SUGGESTIONS = ['Qual o status do meu chamado?', 'Meu notebook não conecta na VPN', 'Qual o horário do service desk?', 'Quero falar com um analista']

function Welcome({ firstName, onPick }: { firstName: string; onPick: (text: string) => void }) {
  return (
    <div className="flex flex-col items-start gap-3 py-6">
      <p className="font-display text-[32px] leading-tight">Olá, {firstName}. Como posso ajudar?</p>
      <p className="max-w-[520px] text-[14.5px] text-ink-3">
        Conte o que está acontecendo com as suas palavras. Eu consulto seus chamados, busco na central de ajuda e chamo um analista
        quando precisar.
      </p>
      <div className="flex flex-wrap gap-1.5 pt-1">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="rounded-lg border border-rule px-3 py-[7px] text-[13.5px] font-medium hover:border-primary hover:bg-primary-soft hover:text-primary-text"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}
