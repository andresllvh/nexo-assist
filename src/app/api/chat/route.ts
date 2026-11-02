import { z } from 'zod'
import type { StreamEvent } from '@/shared/chat'
import { runTurn, TurnRejectedError } from '@/server/agent/turn'
import { problem, readJson, requireUser } from '@/server/http'

const body = z.object({
  conversationId: z.string().min(1),
  input: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('message'), text: z.string().trim().min(1).max(2000) }),
    z.object({ kind: z.literal('confirm_draft'), draftId: z.string() }),
    z.object({ kind: z.literal('cancel_draft'), draftId: z.string() }),
    z.object({ kind: z.literal('select_ticket'), ticketId: z.string() }),
  ]),
})

/**
 * Uma resposta do agent em tempo real: o corpo é NDJSON (um evento JSON por linha), com o
 * entendimento, cada passo executado, os pedaços de texto e a mensagem final.
 */
export async function POST(request: Request) {
  const user = await requireUser('employee')
  if (user instanceof Response) return user
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return problem('Mensagem inválida.', 400)

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: StreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
      try {
        await runTurn({ employee: user, conversationId: parsed.data.conversationId, input: parsed.data.input, emit })
      } catch (error) {
        const message = error instanceof TurnRejectedError ? error.message : 'Não foi possível responder agora. Tente de novo.'
        if (!(error instanceof TurnRejectedError)) console.error('[chat]', error)
        emit({ type: 'error', message })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' },
  })
}
