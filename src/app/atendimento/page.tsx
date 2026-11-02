import { redirect } from 'next/navigation'
import { ChatApp } from '@/components/chat/chat-app'
import { EmployeeShell } from '@/components/employee-shell'
import { getApp } from '@/server/app'
import { currentUser } from '@/server/auth/session'
import { firstName } from '@/server/employees'

export default async function AtendimentoPage() {
  const user = await currentUser()
  if (!user) redirect('/entrar')
  if (user.role === 'analyst') redirect('/console')

  // "voltar outro dia e continuar de onde parei": retoma a última conversa não encerrada
  const app = await getApp()
  const conversation = await app.conversations.view(await app.conversations.resumeOrCreate(user.id))

  return (
    <EmployeeShell user={user} active="atendimento" topBar={false}>
      <ChatApp firstName={firstName(user.name)} initial={conversation} />
    </EmployeeShell>
  )
}
