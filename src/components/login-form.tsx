'use client'

import { ArrowRight, Check, Eye, EyeOff, Lock, Mail } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { cx, Spinner } from './ui'

const DEMO_ACCOUNTS = [
  { email: 'ana.souza@nexo.com.br', who: 'Ana, funcionária com chamados' },
  { email: 'rafael.lima@nexo.com.br', who: 'Rafael, analista N2 (console)' },
]

export function LoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember }),
      })
      const data = (await res.json()) as { redirect?: string; error?: string }
      if (!res.ok || !data.redirect) throw new Error(data.error ?? 'Não foi possível entrar.')
      router.replace(data.redirect)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.')
      setLoading(false)
    }
  }

  const input = 'flex h-11 items-center gap-2.5 rounded-lg border border-line bg-paper pr-2 pl-3.5 focus-within:border-cta focus-within:ring-2 focus-within:ring-cta/15'

  return (
    <form onSubmit={submit} className="flex w-full max-w-[380px] flex-col gap-7" noValidate>
      <div className="flex flex-col gap-2">
        <h2 className="font-display text-[40px] leading-tight">Entrar</h2>
        <p className="text-[15.5px] text-ink-3">Use seu e-mail corporativo e a senha da rede Nexo.</p>
      </div>

      <div className="flex flex-col gap-[18px]">
        <label className="flex flex-col gap-2">
          <span className="text-[13.5px] font-medium">E-mail corporativo</span>
          <span className={input}>
            <Mail className="size-4 text-ink-3" aria-hidden />
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome.sobrenome@nexo.com.br"
              className="w-full bg-transparent text-[14.5px] outline-none placeholder:text-ink-3/70"
            />
          </span>
        </label>

        <label className="flex flex-col gap-2">
          <span className="flex justify-between text-[13.5px] font-medium">
            Senha
            <span className="text-primary-text">Esqueci minha senha</span>
          </span>
          <span className={input}>
            <Lock className="size-4 text-ink-3" aria-hidden />
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-[14.5px] outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="grid size-[30px] place-items-center rounded-md text-ink-3 hover:bg-desk"
              aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>

        <label className="flex cursor-pointer items-center gap-2.5 pt-0.5 text-[13.5px] text-ink-2">
          <input type="checkbox" className="peer sr-only" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span
            className={cx(
              'grid size-[18px] place-items-center rounded-md border peer-focus-visible:ring-2 peer-focus-visible:ring-cta/30',
              remember ? 'border-cta bg-cta' : 'border-line bg-paper',
            )}
          >
            {remember && <Check className="size-3 text-white" strokeWidth={3} />}
          </span>
          Manter conectado neste computador
        </label>
      </div>

      {error && (
        <p role="alert" className="-my-2 rounded-lg bg-danger-soft px-3 py-2 text-[13.5px] text-danger-text">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-cta text-[15.5px] font-semibold text-white transition-colors hover:bg-cta-hover disabled:opacity-60"
      >
        {loading ? <Spinner className="size-4" /> : null}
        Entrar
        {!loading && <ArrowRight className="size-4" />}
      </button>

      <div className="border-t border-rule pt-4 text-[12.5px] text-ink-3">
        <p className="mb-1.5">Ambiente de demonstração: qualquer senha funciona.</p>
        <ul className="flex flex-col gap-1">
          {DEMO_ACCOUNTS.map((a) => (
            <li key={a.email}>
              <button type="button" onClick={() => setEmail(a.email)} className="font-data text-primary-text hover:underline">
                {a.email}
              </button>{' '}
              · {a.who}
            </li>
          ))}
        </ul>
      </div>
    </form>
  )
}
