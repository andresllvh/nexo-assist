import { listConversations } from '@/server/console'
import { json, requireUser } from '@/server/http'

export async function GET() {
  const user = await requireUser('analyst')
  if (user instanceof Response) return user
  return json(await listConversations())
}
