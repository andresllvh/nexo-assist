'use client'

import { AlertTriangle, CheckCircle2, Cpu, RotateCcw, Workflow } from 'lucide-react'
import { useState } from 'react'
import { INTENT_LABEL, type Trace, type TraceStep } from '@/shared/chat'
import { cx } from '../ui'

function confidenceTone(value: number) {
  if (value >= 0.75) return { bar: 'bg-success', text: 'text-success-text', label: 'alta' }
  if (value >= 0.5) return { bar: 'bg-warning', text: 'text-warning-text', label: 'média' }
  return { bar: 'bg-danger', text: 'text-danger-text', label: 'baixa' }
}

export function ConfidenceMeter({ value }: { value: number }) {
  const tone = confidenceTone(value)
  const pct = Math.round(value * 100)
  return (
    <span className="inline-flex items-center gap-2" title={`Confiança ${tone.label}`}>
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-ink/10" aria-hidden>
        <span className={cx('block h-full rounded-full', tone.bar)} style={{ width: `${pct}%` }} />
      </span>
      <span className={cx('font-data text-[12px] font-medium', tone.text)}>{pct}%</span>
    </span>
  )
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-lg bg-desk p-2.5 font-data text-[11.5px] leading-relaxed whitespace-pre-wrap text-ink-2">
      {JSON.stringify(value, null, 2)}
    </pre>
  )
}

function Step({ step }: { step: TraceStep }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="border-t border-rule first:border-t-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2.5 py-2 text-left" aria-expanded={open}>
        {step.status === 'ok' ? (
          <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" aria-label="ok" />
        ) : (
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-danger" aria-label="erro" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] text-ink">{step.label}</span>
          <span className="font-data text-[11px] text-ink-3">{step.tool}</span>
        </span>
        {step.retries > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-warning-text">
            <RotateCcw className="size-3" aria-hidden />
            {step.retries} {step.retries === 1 ? 'nova tentativa' : 'novas tentativas'}
          </span>
        )}
        <span className="w-14 shrink-0 text-right font-data text-[11px] text-ink-3">{step.ms} ms</span>
      </button>
      {open && (
        <div className="grid gap-2 pb-2.5 pl-6 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-medium text-ink-3 uppercase">Entrada</p>
            <Json value={step.input} />
          </div>
          <div>
            <p className="mb-1 text-[11px] font-medium text-ink-3 uppercase">Resultado</p>
            <Json value={step.output} />
          </div>
        </div>
      )}
    </li>
  )
}

/** "Como decidi": o que o agent entendeu, que ação tomou, com que segurança e por quê. */
export function DecisionPanel({ trace }: { trace: Trace }) {
  const { decision } = trace
  return (
    <section className="w-full rounded-xl border border-rule bg-paper p-4 text-[13.5px]" aria-label="Como o agent decidiu">
      <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-[110px_1fr]">
        <dt className="text-ink-3">Entendi</dt>
        <dd>
          <span className="mr-2 inline-block rounded-md bg-primary-soft px-1.5 py-px text-[12px] font-medium text-primary-text">
            {INTENT_LABEL[decision.intent]}
          </span>
          {decision.understood}
        </dd>
        <dt className="text-ink-3">Ação</dt>
        <dd className="font-medium">{decision.action}</dd>
        <dt className="text-ink-3">Segurança</dt>
        <dd>
          <ConfidenceMeter value={decision.confidence} />
        </dd>
        <dt className="text-ink-3">Por quê</dt>
        <dd className="text-ink-2">{decision.reason}</dd>
      </dl>

      {trace.steps.length > 0 && (
        <div className="mt-3.5">
          <p className="mb-1 flex items-center gap-1.5 text-[12px] font-semibold text-ink-3">
            <Workflow className="size-3.5" aria-hidden /> Passo a passo
          </p>
          <ol>
            {trace.steps.map((s) => (
              <Step key={s.id} step={s} />
            ))}
          </ol>
        </div>
      )}

      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-rule pt-2.5 text-[12px] text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="size-3.5" aria-hidden />
          {trace.path === 'agent' ? (trace.model ?? 'modelo') : 'resolvido por regra, sem chamar o modelo'}
        </span>
        {trace.usage && (
          <span className="font-data">
            {trace.usage.inputTokens.toLocaleString('pt-BR')} tokens de entrada · {trace.usage.outputTokens.toLocaleString('pt-BR')} de saída
          </span>
        )}
        <span className="font-data">{(trace.ms / 1000).toFixed(1).replace('.', ',')} s</span>
      </p>
    </section>
  )
}
