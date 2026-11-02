import { z } from 'zod'
import { applyAction, ConsoleActionError, conversationDetail } from '@/server/console'
import { json, problem, readJson, requireUser } from '@/server/http'

export async function GET(_request: Request, ctx: RouteContext<'/api/console/conversations/[id]'>) {
  const user = await requireUser('analyst')
  if (user instanceof Response) return user
  const { id } = await ctx.params
  const detail = await conversationDetail(id)
  return detail ? json(detail) : problem('Conversa não encontrada.', 404)
}

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assume') }),
  z.object({ action: z.literal('return') }),
  z.object({ action: z.literal('close') }),
  z.object({ action: z.literal('message'), text: z.string().trim().min(1).max(2000) }),
])

export async function POST(request: Request, ctx: RouteContext<'/api/console/conversations/[id]'>) {
  const user = await requireUser('analyst')
  if (user instanceof Response) return user
  const parsed = body.safeParse(await readJson(request))
  if (!parsed.success) return problem('Ação inválida.', 400)
  const { id } = await ctx.params
  try {
    await applyAction(user, id, parsed.data)
  } catch (error) {
    if (error instanceof ConsoleActionError) return problem(error.message, 409)
    throw error
  }
  const detail = await conversationDetail(id)
  return detail ? json(detail) : problem('Conversa não encontrada.', 404)
}
