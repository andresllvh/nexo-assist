import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'

export function TopBar({ here, status }: { here: string; status?: ReactNode }) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-rule px-5 md:px-8">
      <p className="flex flex-1 items-center gap-2 text-[13.5px]">
        <span className="text-ink-3">Service desk de TI</span>
        <ChevronRight className="size-3.5 text-ink-3" aria-hidden />
        <span className="font-semibold">{here}</span>
      </p>
      {status}
    </header>
  )
}
