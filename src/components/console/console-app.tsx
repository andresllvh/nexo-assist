'use client'

import { Bot, Hand, Headset, MessagesSquare, Search, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ConsoleDetail, ConsoleListItem } from '@/server/console'
import { formatListTime } from '@/lib/format'
import { LogoutButton } from '../logout-button'
import { cx, Dot, NexoMark, Spinner } from '../ui'
import { ConversationPane } from './conversation-pane'
import { TicketPanel } from './ticket-panel'

type Filter = 'todas' | 'para_voce' | 'com_agent' | 'minhas'

const POLL_MS = 3000

const AVATAR_TONES = [
  'bg-[#DCE9F7] text-[#0062C4]',
  'bg-[#F6E3D3] text-[#9A4A12]',
  'bg-[#E6E1F7] text-[#5B3FC4]',
  'bg-[#DDF0E6] text-[#1E7A4C]',
  'bg-[#F7E1E6] text-[#A3324F]',
  'bg-[#FBEFD0] text-[#8A6100]',
]

export function avatarTone(id: string): string {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_TONES[hash % AVATAR_TONES.length] ?? AVATAR_TONES[0]!
}

export type Analyst = { id: string; name: string; initials: string; level: string }

export function ConsoleApp({ analyst, initialList }: { analyst: Analyst; initialList: ConsoleListItem[] }) {
  const router = useRouter()
  const [list, setList] = useState(initialList)
  const [filter, setFilter] = useState<Filter>('para_voce')
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialList.find((c) => c.status === 'waiting')?.id ?? initialList[0]?.id ?? null)
  const [detail, setDetail] = useState<ConsoleDetail | null>(null)
  const [actionBusy, setActionBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const selectedRef = useRef(selectedId)

  useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])

  const refreshList = useCallback(async () => {
    const res = await fetch('/api/console/conversations', { cache: 'no-store' }).catch(() => null)
    if (res?.status === 401) return router.replace('/entrar')
    if (res?.ok) setList((await res.json()) as ConsoleListItem[])
  }, [router])

  const refreshDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/console/conversations/${id}`, { cache: 'no-store' }).catch(() => null)
    // ignora respostas que chegam depois de o analista trocar de conversa
    if (res?.ok && selectedRef.current === id) setDetail((await res.json()) as ConsoleDetail)
  }, [])

  // lista e conversa aberta se atualizam sozinhas (consulta a cada 3 s)
  useEffect(() => {
    const timer = setInterval(() => {
      void refreshList()
      if (selectedRef.current) void refreshDetail(selectedRef.current)
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [refreshList, refreshDetail])

  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    void fetch(`/api/console/conversations/${selectedId}`, { cache: 'no-store' }).then(async (res) => {
      if (!cancelled && res.ok) setDetail((await res.json()) as ConsoleDetail)
    })
    return () => {
      cancelled = true
    }
  }, [selectedId])

  async function act(body: { action: 'assume' | 'return' | 'close' } | { action: 'message'; text: string }) {
    if (!selectedId) return false
    setActionBusy(body.action)
    setError(null)
    try {
      const res = await fetch(`/api/console/conversations/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = (await res.json()) as ConsoleDetail & { error?: string }
      if (!res.ok) throw new Error(data.error ?? 'Não foi possível concluir a ação.')
      setDetail(data)
      // a conversa assumida sai de "Para você"; acompanha ela em "Minhas"
      if (body.action === 'assume') setFilter('minhas')
      void refreshList()
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível concluir a ação.')
      return false
    } finally {
      setActionBusy(null)
    }
  }

  const counts = useMemo(
    () => ({
      todas: list.length,
      para_voce: list.filter((c) => c.status === 'waiting').length,
      com_agent: list.filter((c) => c.status === 'agent').length,
      minhas: list.filter((c) => c.status === 'analyst' && c.assignedAnalyst?.id === analyst.id).length,
    }),
    [list, analyst.id],
  )

  const visible = list.filter((c) => {
    const matchesFilter =
      filter === 'todas' ||
      (filter === 'para_voce' && c.status === 'waiting') ||
      (filter === 'com_agent' && c.status === 'agent') ||
      (filter === 'minhas' && c.status === 'analyst' && c.assignedAnalyst?.id === analyst.id)
    const q = query.trim().toLowerCase()
    const matchesQuery = !q || c.employee.name.toLowerCase().includes(q) || (c.ticketId ?? '').toLowerCase().includes(q) || c.lastText.toLowerCase().includes(q)
    return matchesFilter && matchesQuery
  })

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'todas', label: 'Todas' },
    { id: 'para_voce', label: 'Para você' },
    { id: 'com_agent', label: 'Com o agent' },
    { id: 'minhas', label: 'Minhas' },
  ]

  const current = detail && detail.conversation.id === selectedId ? detail : null

  return (
    <div className="flex h-full">
      <nav className="flex w-16 shrink-0 flex-col items-center gap-1.5 border-r border-rule bg-desk py-4" aria-label="Console">
        <span className="grid size-10 place-items-center pb-2">
          <NexoMark size={22} />
        </span>
        <span className="relative grid size-10 place-items-center rounded-xl bg-paper" title="Conversas">
          <MessagesSquare className="size-[19px]" aria-hidden />
          {counts.para_voce > 0 && (
            <span className="absolute -top-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border-2 border-desk bg-cta px-1 text-[10px] font-bold text-white">
              {counts.para_voce}
            </span>
          )}
        </span>
        <span className="flex-1" />
        <LogoutButton compact />
        <span className="relative grid size-9 place-items-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text" title={analyst.name}>
          {analyst.initials}
          <span className="absolute right-0 bottom-0 size-2.5 rounded-full border-2 border-desk bg-success" />
        </span>
      </nav>

      <section className="flex w-[380px] shrink-0 flex-col border-r border-rule" aria-label="Conversas">
        <header className="flex flex-col gap-3 px-4 pt-4 pb-2.5">
          <div className="flex items-center gap-2">
            <h1 className="flex-1 text-[20px] font-bold">Conversas</h1>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-[5px] text-[12.5px] font-semibold text-success-text">
              <Dot className="bg-success" size={7} /> Disponível
            </span>
          </div>
          <label className="flex h-9 items-center gap-2.5 rounded-full bg-desk px-3">
            <Search className="size-[15px] text-ink-3" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar conversa ou chamado"
              className="w-full bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
              aria-label="Pesquisar conversa ou chamado"
            />
          </label>
          <div className="flex flex-wrap gap-1" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-[9px] py-1.5 text-[12.5px] font-medium',
                  filter === f.id ? 'bg-primary-soft text-primary-text' : 'bg-desk text-ink-2 hover:bg-rule',
                )}
              >
                {f.label}
                {f.id !== 'todas' && <span className={cx('font-semibold', filter === f.id ? 'text-primary-text' : 'text-ink-3')}>{counts[f.id]}</span>}
              </button>
            ))}
          </div>
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visible.length === 0 && <li className="px-3 py-8 text-center text-[13.5px] text-ink-3">Nenhuma conversa neste filtro.</li>}
          {visible.map((c) => (
            <li key={c.id}>
              <ListItem item={c} selected={c.id === selectedId} onSelect={() => setSelectedId(c.id)} />
            </li>
          ))}
        </ul>
      </section>

      {current ? (
        <>
          <ConversationPane
            detail={current}
            analyst={analyst}
            busy={actionBusy}
            error={error}
            onAssume={() => act({ action: 'assume' })}
            onReturn={() => act({ action: 'return' })}
            onClose={() => act({ action: 'close' })}
            onSend={(text) => act({ action: 'message', text })}
          />
          <TicketPanel detail={current} />
        </>
      ) : (
        <div className="grid flex-1 place-items-center bg-console text-[13.5px] text-ink-3">
          {selectedId ? (
            <span className="flex items-center gap-2">
              <Spinner /> Abrindo conversa…
            </span>
          ) : (
            'Selecione uma conversa'
          )}
        </div>
      )}
    </div>
  )
}

function ListItem({ item, selected, onSelect }: { item: ConsoleListItem; selected: boolean; onSelect: () => void }) {
  const tag =
    item.status === 'waiting'
      ? item.handoff?.kind === 'baixa_confianca'
        ? { dot: 'bg-warning', text: 'text-warning-text', label: `Agent pediu ajuda · confiança ${Math.round((item.handoff.confidence ?? 0) * 100)}%`, icon: Bot }
        : { dot: 'bg-danger', text: 'text-danger-text', label: `Transferida${item.ticketId ? ` · ${item.ticketId}` : ''}`, icon: Headset }
      : item.status === 'analyst'
        ? { dot: 'bg-primary', text: 'text-primary-text', label: `Com ${item.assignedAnalyst?.name ?? 'analista'}`, icon: Hand }
        : item.status === 'agent'
          ? { dot: 'bg-success', text: 'text-ink-3', label: 'Agent atendendo', icon: Bot }
          : { dot: 'bg-ink/30', text: 'text-ink-3', label: 'Encerrada', icon: XCircle }
  const urgent = item.status === 'waiting'
  const prefix = item.lastAuthor === 'agent' ? 'Nexo: ' : item.lastAuthor === 'analyst' ? 'Você: ' : ''

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected}
      className={cx('flex w-full gap-3 rounded-xl p-2.5 text-left', selected ? 'bg-desk' : 'hover:bg-desk/60')}
    >
      <span className={cx('grid size-[46px] shrink-0 place-items-center rounded-full text-[15.5px] font-semibold', avatarTone(item.employee.id))}>
        {item.employee.initials}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="flex items-center gap-2">
          <span className={cx('flex-1 truncate text-[15.5px]', urgent ? 'font-semibold' : 'font-medium')}>{item.employee.name}</span>
          <span className={cx('text-[12.5px]', urgent ? 'font-semibold text-cta' : 'text-ink-3')}>{formatListTime(item.lastAt)}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="flex-1 truncate text-[13.5px] text-ink-3">
            {prefix}
            {item.lastText}
          </span>
          {item.pending > 0 && item.status !== 'agent' && item.status !== 'closed' && (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-cta px-1.5 text-[11.5px] font-bold text-white">{item.pending}</span>
          )}
        </span>
        <span className={cx('inline-flex items-center gap-[5px] text-[11.5px] font-medium', tag.text)}>
          <Dot className={tag.dot} />
          {tag.label}
        </span>
      </span>
    </button>
  )
}
