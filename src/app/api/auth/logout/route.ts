import { clearSession } from '@/server/auth/session'
import { json } from '@/server/http'

export async function POST() {
  await clearSession()
  return json({ ok: true })
}
