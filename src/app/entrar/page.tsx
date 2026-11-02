import { redirect } from 'next/navigation'
import { LoginForm } from '@/components/login-form'
import { NexoMark } from '@/components/ui'
import { currentUser } from '@/server/auth/session'

export default async function SignInPage() {
  const user = await currentUser()
  if (user) redirect(user.role === 'analyst' ? '/console' : '/atendimento')

  return (
    <main className="flex min-h-full">
      <section className="hidden w-[800px] shrink-0 flex-col justify-between bg-showcase px-16 pt-10 pb-12 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <NexoMark size={24} tone="white" />
          <span className="text-[17px] font-bold">Nexo Assist</span>
        </div>

        <div className="flex flex-col gap-9">
          <div className="flex flex-col gap-4">
            <p className="text-[13.5px] font-medium text-white/55">Service desk de TI da Nexo</p>
            <h1 className="font-display text-[54px] leading-[1.05]">Seu problema de TI, resolvido em uma conversa.</h1>
            <p className="max-w-[520px] text-base text-white/65">
              Descreva o que está acontecendo. O assistente consulta seus chamados, busca na central de ajuda e chama um analista
              quando precisa.
            </p>
          </div>

          <div className="pl-24" aria-hidden>
            <div className="flex w-[500px] flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.04] p-[18px]">
              <div className="flex justify-end">
                <p className="rounded-[12px_12px_4px_12px] bg-paper px-3.5 py-2 text-[13.5px] text-ink">
                  Meu notebook não conecta na VPN. Erro 809.
                </p>
              </div>
              <div className="flex flex-col gap-1.5">
                <p className="text-[12.5px]">
                  <span className="font-semibold text-white/80">Nexo Assist</span>
                  <span className="ml-1.5 text-white/45">consultou seus chamados · criou um chamado</span>
                </p>
                <p className="w-[380px] rounded-[4px_12px_12px_12px] bg-white/[0.08] px-3.5 py-2.5 text-[13.5px]">
                  Pronto: abri o chamado com prioridade alta. Um analista fala com você em até 4 h úteis.
                </p>
                <p className="flex w-fit items-center gap-2 rounded-xl bg-paper px-3 py-1.5 text-[12.5px] text-ink">
                  <span className="size-[7px] rounded-full bg-warning" />
                  <span className="font-semibold">INC-20517</span>
                  <span className="text-ink-3">Rede e VPN · Alta · em até 4 h</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-3 border-t border-white/10 pt-6">
          {[
            ['8 s', 'primeira resposta, em média', false],
            ['72%', 'resolvidos sem fila', false],
            ['6', 'analistas online agora', true],
          ].map(([value, label, live], i) => (
            <div key={String(label)} className={i > 0 ? 'border-l border-white/10 pl-6' : ''}>
              <dd className="flex items-center gap-2 font-display text-[34px]">
                {value}
                {live && <span className="size-2 rounded-full bg-success" />}
              </dd>
              <dt className="text-[13.5px] text-white/55">{label}</dt>
            </div>
          ))}
        </dl>
      </section>

      <section className="flex flex-1 flex-col px-6 py-10 sm:px-14">
        <p className="flex justify-end gap-1.5 text-[13.5px]">
          <span className="text-ink-3">Problema para entrar?</span>
          <span className="font-semibold text-primary-text">Ligue no ramal 4000</span>
        </p>
        <div className="flex flex-1 items-center justify-center py-10">
          <LoginForm />
        </div>
        <footer className="flex justify-between text-[12.5px] text-ink-3">
          <span>© 2026 Nexo · Service desk de TI</span>
          <span>Privacidade e uso de dados</span>
        </footer>
      </section>
    </main>
  )
}
