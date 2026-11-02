import { redirect } from 'next/navigation'
import { currentUser } from '@/server/auth/session'

export default async function Home() {
  const user = await currentUser()
  if (!user) redirect('/entrar')
  redirect(user.role === 'analyst' ? '/console' : '/atendimento')
}
