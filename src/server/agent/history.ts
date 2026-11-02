import type { Block, DraftView, MessageView } from '@/shared/chat'

const DRAFT_STATUS: Record<DraftView['status'], string> = {
  pending: 'aguardando confirmação',
  confirmed: 'confirmado',
  cancelled: 'cancelado',
}

/** Resume um bloco visual em texto, para o modelo saber o que a pessoa viu na tela. */
function describeBlock(block: Block): string {
  switch (block.kind) {
    case 'ticket_selector':
      return `[mostrou para escolher: ${block.tickets.map((t) => `${t.id} ${t.title}`).join('; ')}]`
    case 'ticket_card':
      return `[cartão do ${block.ticket.id}: ${block.ticket.status}, prioridade ${block.ticket.priority}${block.ticket.overdue ? ', prazo vencido' : ''}]`
    case 'draft': {
      const d = block.draft
      const what = d.kind === 'create' ? 'novo chamado' : d.kind === 'reopen' ? `reabrir ${d.targetTicketId}` : `complementar ${d.targetTicketId}`
      return `[rascunho ${d.id} (${what}) "${d.title}", prioridade ${d.priority}, ${DRAFT_STATUS[d.status]}${d.ticketId ? `, gerou ${d.ticketId}` : ''}]`
    }
    case 'options':
      return `[opções: ${block.options.join(' / ')}]`
  }
}

export function messageAsText(m: MessageView): string {
  const blocks = m.blocks.map(describeBlock).join(' ')
  return [m.text, blocks].filter(Boolean).join(' ')
}

export type ModelMessage = { role: 'user'; content: string } | { role: 'assistant'; content: string }

/**
 * Histórico enviado ao modelo: só as últimas mensagens, para controlar custo por conversa.
 * Mensagens do analista e do sistema entram como contexto do lado do service desk.
 */
export function toModelMessages(messages: MessageView[], limit = 14): ModelMessage[] {
  const recent = messages.slice(-limit)
  const result: ModelMessage[] = []
  for (const m of recent) {
    const content =
      m.author === 'employee'
        ? m.text
        : m.author === 'analyst'
          ? `[analista ${m.authorName}]: ${m.text}`
          : m.author === 'system'
            ? `[sistema]: ${m.text}`
            : messageAsText(m)
    const role = m.author === 'employee' ? ('user' as const) : ('assistant' as const)
    const last = result.at(-1)
    // o Gemini não aceita dois turnos seguidos do mesmo papel; junta em um só
    if (last && last.role === role) last.content += `\n${content}`
    else result.push({ role, content })
  }
  return result
}

export function transcript(messages: MessageView[], limit = 8): string {
  return messages
    .slice(-limit)
    .map((m) => `${m.author === 'employee' ? 'Funcionário' : m.author === 'agent' ? 'Nexo' : m.authorName}: ${messageAsText(m)}`)
    .join('\n')
}
