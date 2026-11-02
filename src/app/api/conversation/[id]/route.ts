import { getApp } from '@/server/app'
import { json, problem, requireUser } from '@/server/http'

/** Usado pela tela do funcionário para acompanhar a conversa enquanto um analista atende. */
export async function GET(_request: Request, ctx: RouteContext<'/api/conversation/[id]'>) {
  const user = await requireUser('employee')
  if (user instanceof Response) return user
  const { id } = await ctx.params
  const app = await getApp()
  const conversation = await app.conversations.getForEmployee(id, user.id)
  if (!conversation) return problem('Conversa não encontrada.', 404)
  return json(await app.conversations.view(conversation))
}
