import { KeyRound } from 'lucide-react'
import { redirect } from 'next/navigation'
import { EmployeeShell } from '@/components/employee-shell'
import { currentUser } from '@/server/auth/session'

export default async function PerfilPage() {
  const user = await currentUser()
  if (!user) redirect('/entrar')
  if (user.role === 'analyst') redirect('/console')

  const rows: [string, string, string?][] = [
    ['Nome', user.name],
    ['E-mail corporativo', user.email, 'Gerenciado pela TI'],
    ['Área', user.department],
    ['Computador', `Notebook com ${user.os}`],
  ]

  return (
    <EmployeeShell user={user} active="perfil">
      <div className="mx-auto w-full max-w-[720px] px-6 py-10">
        <h1 className="text-[24px] font-bold">Meu perfil</h1>
        <p className="mt-1 text-[14.5px] text-ink-3">Seus dados de acesso ao service desk de TI.</p>

        <dl className="mt-8 rounded-2xl border border-rule">
          {rows.map(([key, value, note], i) => (
            <div key={key} className={`flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 ${i > 0 ? 'border-t border-rule' : ''}`}>
              <dt className="w-40 text-[13.5px] text-ink-3">{key}</dt>
              <dd className="flex-1 text-[14.5px] font-medium">{value}</dd>
              {note && <span className="text-[12.5px] text-ink-3">{note}</span>}
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-rule px-5 py-4">
          <KeyRound className="size-5 text-ink-3" aria-hidden />
          <div className="flex-1">
            <p className="text-[14.5px] font-semibold">Senha</p>
            <p className="text-[13px] text-ink-3">A senha da rede é a mesma do e-mail e da VPN. Para trocar, use senha.nexo.com.br.</p>
          </div>
        </div>
      </div>
    </EmployeeShell>
  )
}
