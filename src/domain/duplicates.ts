import type { Category, Ticket } from './types'
import { isOpen } from './types'

const STOPWORDS = new Set(
  ('a o e é de da do das dos em no na nos nas um uma para por com sem que se ao à meu minha ' +
    'não nao está esta estou tá ta foi ser ter tem mais muito depois após desde ontem hoje').split(' '),
)

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 2 && !STOPWORDS.has(t)),
  )
}

export function similarity(a: string, b: string): number {
  const ta = tokenize(a)
  const tb = tokenize(b)
  if (ta.size === 0 || tb.size === 0) return 0
  let shared = 0
  for (const t of ta) if (tb.has(t)) shared++
  // coeficiente de sobreposição: um título curto contido num texto longo ainda conta como parecido
  return shared / Math.min(ta.size, tb.size)
}

const REOPEN_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
const SIMILARITY_THRESHOLD = 0.5

export type DuplicateCheck =
  | { kind: 'none' }
  | { kind: 'open'; ticket: Ticket; score: number }
  | { kind: 'reopen'; ticket: Ticket; score: number }

/**
 * Regra "sem duplicidade" do Anexo A: se já existe um chamado aberto sobre o mesmo problema,
 * ele é atualizado; se foi resolvido há até 7 dias, pode ser reaberto.
 */
export function findDuplicate(
  candidate: { title: string; description: string; category: Category },
  existing: Ticket[],
  now: Date,
): DuplicateCheck {
  const text = `${candidate.title} ${candidate.description}`
  let best: DuplicateCheck = { kind: 'none' }
  let bestScore = 0

  for (const ticket of existing) {
    if (ticket.category !== candidate.category) continue
    const score = similarity(text, `${ticket.title} ${ticket.description}`)
    if (score < SIMILARITY_THRESHOLD || score <= bestScore) continue
    if (isOpen(ticket)) {
      best = { kind: 'open', ticket, score }
      bestScore = score
    } else if (canReopen(ticket, now)) {
      best = { kind: 'reopen', ticket, score }
      bestScore = score
    }
  }
  return best
}

export function canReopen(ticket: Pick<Ticket, 'status' | 'resolvedAt'>, now: Date): boolean {
  if (ticket.status !== 'Resolvido' || !ticket.resolvedAt) return false
  return now.getTime() - ticket.resolvedAt.getTime() <= REOPEN_WINDOW_MS
}
