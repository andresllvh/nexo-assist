import { Agent } from '@mastra/core/agent'
import { z } from 'zod'
import { INTENTS, type Intent } from '@/shared/chat'

/**
 * Etapa de entendimento: antes de agir, um modelo barato classifica a mensagem e diz com que segurança.
 * Isso alimenta o painel "o que o agent entendeu" e permite regras no código
 * (ex.: pediu analista → transfere; confiança baixa → chama um humano).
 */
export const routerSchema = z.object({
  intencao: z.enum(INTENTS),
  entendimento: z.string().describe('o que o funcionário quer, em uma frase, em português'),
  confianca: z.number().min(0).max(1),
  motivo: z.string().describe('por que escolheu essa intenção, em uma frase'),
  chamado: z.string().nullable().describe('número do chamado citado ou escolhido (ex.: INC-20311), se houver'),
})

export type RouterOutput = z.infer<typeof routerSchema>

const INSTRUCTIONS = `Você classifica mensagens enviadas ao Nexo Assist, o atendente virtual do service desk de TI da Nexo.
Leia o histórico e a ÚLTIMA mensagem do funcionário e devolva a intenção dela.

Intenções:
- duvida: pergunta que a central de ajuda pode responder (como fazer, horário, senha do Wi-Fi, configurar algo).
- consultar_chamado: quer saber status/prazo de chamado dele.
- complementar_chamado: quer adicionar informação a um chamado existente ou reabrir um resolvido.
- abrir_chamado: relata problema de TI ou pede acesso/equipamento/software, OU está respondendo a perguntas para completar um chamado.
- falar_com_analista: pede explicitamente uma pessoa/analista/humano, ou aceita a oferta de chamar um analista.
- confirmar: aprova o rascunho que está aguardando confirmação ("pode criar", "sim", "confirmo").
- corrigir: quer mudar algo no rascunho pendente.
- cancelar: desiste do rascunho pendente ou da ação proposta.
- fora_do_escopo: o PEDIDO é de RH, financeiro (reembolso, pagamento, nota fiscal), folha, férias, facilities, limpeza ou assunto pessoal.
  Atenção: o departamento de quem escreve não muda o escopo. Sistema, computador ou acesso com problema é TI mesmo
  que seja da área Financeira ou de RH (ex.: "o sistema de folha do RH não abre" é abrir_chamado).
- conversa: cumprimento, agradecimento, "não, obrigado" ou algo sem pedido.

Confiança (0 a 1):
- 0.9+: a intenção é clara.
- 0.6 a 0.85: provável, mas há alguma ambiguidade.
- abaixo de 0.5: não dá para saber o que a pessoa quer ou o que fazer (mensagem confusa, mistura assuntos, contexto insuficiente).

Respostas curtas como "sim", "só eu", "1" dependem da última pergunta do Nexo: use o histórico.`

export function createRouter(model: string) {
  return new Agent({ id: 'nexo-router', name: 'Nexo Router', instructions: INSTRUCTIONS, model })
}

export type RouterInput = {
  transcript: string
  lastMessage: string
  pendingDraft: string | null
}

export function routerPrompt(input: RouterInput): string {
  return [
    `Histórico recente:\n${input.transcript || '(início da conversa)'}`,
    `Rascunho aguardando confirmação: ${input.pendingDraft ?? 'nenhum'}`,
    `Última mensagem do funcionário: """${input.lastMessage}"""`,
  ].join('\n\n')
}

export type { Intent }
