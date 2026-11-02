import { MessagesSquare, UserRound } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import type { Employee } from '@/domain/types'
import { initials } from '@/server/employees'
import { LogoutButton } from './logout-button'
import { TopBar } from './top-bar'
import { cx, NexoMark } from './ui'

type Section = 'atendimento' | 'perfil'

const NAV: { id: Section; href: string; label: string; icon: typeof MessagesSquare }[] = [
  { id: 'atendimento', href: '/atendimento', label: 'Atendimento', icon: MessagesSquare },
  { id: 'perfil', href: '/perfil', label: 'Meu perfil', icon: UserRound },
]

/** Layout das telas do funcionário. Com `topBar={false}` a página desenha a própria barra (o chat muda o status ao vivo). */
export function EmployeeShell({ user, active, topBar = true, children }: { user: Employee; active: Section; topBar?: boolean; children: ReactNode }) {
  const current = NAV.find((n) => n.id === active)
  return (
    <div className="flex h-full">
      <aside className="hidden w-[232px] shrink-0 flex-col border-r border-rule px-3.5 pt-5 pb-3.5 md:flex">
        <div className="flex items-center gap-2.5 px-2">
          <NexoMark />
          <span className="text-base font-bold">Nexo Assist</span>
        </div>
        <nav className="mt-[22px] flex flex-col gap-0.5" aria-label="Principal">
          {NAV.map(({ id, href, label, icon: Icon }) => (
            <Link
              key={id}
              href={href}
              aria-current={id === active ? 'page' : undefined}
              className={cx(
                'flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[13.5px]',
                id === active ? 'bg-primary-soft font-semibold text-primary-text' : 'font-medium text-ink-2 hover:bg-desk',
              )}
            >
              <Icon className={cx('size-4', id === active ? 'text-primary-text' : 'text-ink-3')} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="flex items-center gap-2.5 border-t border-rule px-2 pt-3.5 pb-1">
          <span className="grid size-[34px] shrink-0 place-items-center rounded-full bg-primary-soft text-[12.5px] font-bold text-primary-text">
            {initials(user.name)}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold">{user.name}</span>
            <span className="block truncate text-[11.5px] text-ink-3">{user.email}</span>
          </span>
        </div>
        <LogoutButton />
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        {topBar && <TopBar here={current?.label ?? ''} />}
        {children}
      </main>
    </div>
  )
}
