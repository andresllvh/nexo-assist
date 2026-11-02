/**
 * Avaliação da etapa de entendimento: mensagens reais de funcionários, com a intenção esperada.
 * Mede acerto de intenção e se a confiança fica baixa nos casos ambíguos (que devem ir para um humano).
 *
 *   npm run eval            roda todos os casos
 *   npm run eval -- --only=3  roda só o caso 3
 *
 * Cada caso faz 1 chamada ao modelo de entendimento. No plano gratuito do Gemini há limite por minuto,
 * então o script espera entre as chamadas.
 */
import { MIN_CONFIDENCE } from '../src/server/agent/turn'
import { createRouter, routerPrompt, routerSchema, type RouterOutput } from '../src/server/agent/router'
import type { Intent } from '../src/shared/chat'

process.loadEnvFile()

type Case = {
  mensagem: string
  historico?: string
  rascunhoPendente?: string
  esperado: Intent | Intent[]
  /** caso ambíguo de propósito: a confiança deveria ficar abaixo do limite de transferência */
  ambiguo?: boolean
}

const CASES: Case[] = [
  { mensagem: 'Meu notebook não conecta na VPN desde ontem. Aparece o erro 809.', esperado: 'abrir_chamado' },
  { mensagem: 'Qual o horário de atendimento do service desk?', esperado: 'duvida' },
  { mensagem: 'Como faço para trocar a senha da rede?', esperado: 'duvida' },
  { mensagem: 'Qual o status do meu chamado?', esperado: 'consultar_chamado' },
  { mensagem: 'E aquele chamado do notebook lento, alguma novidade?', esperado: 'consultar_chamado' },
  { mensagem: 'Quero acrescentar no INC-20311 que agora a tela também pisca', esperado: 'complementar_chamado' },
  { mensagem: 'A senha do SAP bloqueou de novo, igual semana passada', esperado: ['abrir_chamado', 'complementar_chamado'] },
  { mensagem: 'Preciso de acesso à pasta de Contratos no SharePoint', esperado: 'abrir_chamado' },
  { mensagem: 'Quero falar com uma pessoa, por favor', esperado: 'falar_com_analista' },
  { mensagem: 'O sistema de faturamento caiu para toda a equipe do Financeiro', esperado: 'abrir_chamado' },
  { mensagem: 'Como peço minhas férias?', esperado: 'fora_do_escopo' },
  { mensagem: 'O ar-condicionado da sala 3 está pingando', esperado: 'fora_do_escopo' },
  { mensagem: 'Obrigado, resolveu!', esperado: 'conversa' },
  {
    mensagem: 'Só eu. Tenho reunião com um cliente às 14h.',
    historico: 'Funcionário: Meu notebook não conecta na VPN\nNexo: Quem está sendo afetado? [opções: Só eu / Minha equipe / Toda a empresa]',
    esperado: 'abrir_chamado',
  },
  {
    mensagem: 'pode criar',
    historico: 'Nexo: Confira antes de eu criar [rascunho D-381 "VPN não conecta — erro 809", aguardando confirmação]',
    rascunhoPendente: 'D-381: VPN não conecta — erro 809',
    esperado: 'confirmar',
  },
  {
    mensagem: 'na verdade é a equipe toda que está sem VPN',
    historico: 'Nexo: Confira antes de eu criar [rascunho D-381 "VPN não conecta", afetados: somente você, aguardando confirmação]',
    rascunhoPendente: 'D-381: VPN não conecta',
    esperado: 'corrigir',
  },
  { mensagem: 'esquece, não precisa mais', rascunhoPendente: 'D-381: VPN não conecta', esperado: 'cancelar' },
  { mensagem: 'aquilo lá de ontem sabe', esperado: ['conversa', 'consultar_chamado', 'complementar_chamado'], ambiguo: true },
  { mensagem: 'asdkj sistema coisa não vai', esperado: ['abrir_chamado', 'conversa'], ambiguo: true },
]

const MODEL = process.env.NEXO_ROUTER_MODEL ?? 'google/gemini-3.5-flash-lite'
const DELAY_MS = Number(process.env.EVAL_DELAY_MS ?? 4000)
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]

const router = createRouter(MODEL)
const selected = only ? CASES.filter((_, i) => String(i + 1) === only) : CASES
let hits = 0
let ambiguousCaught = 0
let ambiguousTotal = 0
let falseHandoffs = 0
const rows: string[] = []

for (const [i, c] of selected.entries()) {
  if (i > 0) await new Promise((r) => setTimeout(r, DELAY_MS))
  const started = Date.now()
  let out: RouterOutput
  try {
    const result = await router.generate(
      routerPrompt({ transcript: c.historico ?? '', lastMessage: c.mensagem, pendingDraft: c.rascunhoPendente ?? null }),
      {
        structuredOutput: { schema: routerSchema },
        modelSettings: { temperature: 0 },
        providerOptions: { google: { thinkingConfig: { thinkingLevel: 'minimal' } } },
      },
    )
    out = result.object as RouterOutput
  } catch (error) {
    rows.push(`ERRO  "${c.mensagem}" → ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`)
    continue
  }
  const expected = Array.isArray(c.esperado) ? c.esperado : [c.esperado]
  const ok = expected.includes(out.intencao)
  const low = out.confianca < MIN_CONFIDENCE
  if (ok) hits++
  if (c.ambiguo) {
    ambiguousTotal++
    if (low) ambiguousCaught++
  } else if (low) {
    falseHandoffs++
  }
  rows.push(
    `${ok ? 'ok  ' : 'ERRO'}  ${String(Math.round(out.confianca * 100)).padStart(3)}%  ${out.intencao.padEnd(20)} "${c.mensagem}"` +
      (ok ? '' : `  (esperado: ${expected.join(' ou ')})`) +
      `  ${Date.now() - started}ms`,
  )
}

console.log(`Modelo de entendimento: ${MODEL}\n`)
console.log(rows.join('\n'))
const clear = selected.length - ambiguousTotal
console.log(`\nIntenção correta: ${hits}/${selected.length} (${Math.round((hits / selected.length) * 100)}%)`)
if (ambiguousTotal) {
  console.log(`Ambíguos com confiança abaixo de ${MIN_CONFIDENCE * 100}% (o agent pede esclarecimento; se continuar, chama um analista): ${ambiguousCaught}/${ambiguousTotal}`)
}
console.log(`Casos claros tratados como incertos sem necessidade: ${falseHandoffs}/${clear}`)
