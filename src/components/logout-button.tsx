'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { cx } from './ui'

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function logout() {
    setLeaving(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.replace('/entrar')
  }

  return (
    <button
      type="button"
      onClick={logout}
      disabled={leaving}
      title="Sair"
      className={cx(
        'flex items-center gap-2.5 rounded-lg text-[13.5px] font-medium text-ink-2 hover:bg-desk disabled:opacity-60',
        compact ? 'size-9 justify-center' : 'h-[34px] px-2.5',
      )}
    >
      <LogOut className="size-4 text-ink-3" aria-hidden />
      {!compact && 'Sair'}
    </button>
  )
}
