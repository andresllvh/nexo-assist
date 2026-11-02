import { redirect } from 'next/navigation'
import { ConsoleApp } from '@/components/console/console-app'
import { currentUser } from '@/server/auth/session'
import { listConversations } from '@/server/console'
import { initials } from '@/server/employees'

export default async function ConsolePage() {
  const user = await currentUser()
  if (!user) redirect('/entrar')
  if (user.role !== 'analyst') redirect('/atendimento')

  const conversations = await listConversations()
  return (
    <ConsoleApp
      analyst={{ id: user.id, name: user.name, initials: initials(user.name), level: user.supportLevel ?? 'N1' }}
      initialList={conversations}
    />
  )
}
