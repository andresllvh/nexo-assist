import { getApp } from '@/server/app'
import { json, requireUser } from '@/server/http'

/** Conversa atual do funcionário: retoma a última não encerrada ou começa uma nova. */
export async function GET() {
  const user = await requireUser('employee')
  if (user instanceof Response) return user
  const app = await getApp()
  const conversation = await app.conversations.resumeOrCreate(user.id)
  return json(await app.conversations.view(conversation))
}

/** "Nova conversa": encerra a atual (se estiver com o agent) e abre outra, zerando o limite de mensagens. */
export async function POST() {
  const user = await requireUser('employee')
  if (user instanceof Response) return user
  const app = await getApp()
  const current = await app.conversations.latestOpenFor(user.id)
  if (current && current.status === 'agent') await app.conversations.close(current.id)
  const fresh = current && current.status !== 'agent' ? current : await app.conversations.create(user.id)
  return json(await app.conversations.view(fresh))
}
