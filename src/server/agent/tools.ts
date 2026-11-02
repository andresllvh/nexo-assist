import { z } from 'zod'
import { CATEGORIES } from '@/domain/types'
import { searchArticles } from '../helpcenter/search'
import { toTicketView } from '../views'
import { defineTool } from './context'
import {
  handOff,
  IMPACT_LABEL,
  lookupTicket,
  OVERDUE_OPTIONS,
  prepareCreateDraft,
  prepareUpdateDraft,
} from './operations'

// Ferramentas do Nexo Assist. Nenhuma recebe o id do funcionário: ele vem da sessão (TurnContext).

export const searchHelpCenter = defineTool({
  id: 'buscar_central_de_ajuda',
  description:
    'Busca artigos na central de ajuda. Use antes de abrir chamado para dúvidas e problemas comuns. ' +
    'Leia o campo "valePara": se o artigo não vale para o caso do funcionário (ex.: sistema operacional), não sugira.',
  inputSchema: z.object({ consulta: z.string().min(2).describe('palavras-chave do problema, ex.: "vpn erro 809"') }),
  run: async ({ consulta }) => {
    const hits = searchArticles(consulta)
    return {
      output: {
        artigos: hits.map((h) => ({ id: h.article.id, titulo: h.article.title, texto: h.article.body, valePara: h.article.appliesTo ?? 'todos' })),
      },
      label: hits.length ? `encontrou ${hits.map((h) => h.article.id).join(', ')}` : 'nenhum artigo encontrado',
      chips: ['buscou na central de ajuda'],
    }
  },
})

export const listMyTickets = defineTool({
  id: 'listar_meus_chamados',
  description:
    'Lista os chamados do funcionário logado, com status e prazo. Use para consultar status, checar duplicidade ' +
    'e quando ele não lembra o número do chamado.',
  inputSchema: z.object({ incluirEncerrados: z.boolean().default(false) }),
  run: async ({ incluirEncerrados }, turn) => {
    const all = await turn.tickets.listByRequester(turn.employee.id)
    const list = all.map((t) => toTicketView(t, turn.now)).filter((t) => incluirEncerrados || t.open)
    return {
      output: {
        chamados: list.map((t) => ({ id: t.id, titulo: t.title, status: t.status, prioridade: t.priority, categoria: t.category, vencido: t.overdue })),
      },
      label: `${list.length} chamados ${incluirEncerrados ? 'no total' : 'abertos'}`,
      chips: ['consultou seus chamados'],
    }
  },
})

export const askTicketChoice = defineTool({
  id: 'mostrar_escolha_de_chamado',
  description:
    'Mostra ao funcionário uma lista clicável de chamados para ele escolher sobre qual quer falar. ' +
    'Use quando ele tem mais de um chamado aberto e não disse qual.',
  inputSchema: z.object({ chamados: z.array(z.string()).min(2).max(6).describe('ids dos chamados, ex.: INC-20311') }),
  run: async ({ chamados }, turn) => {
    const mine = await turn.tickets.listByRequester(turn.employee.id)
    // só entram chamados do próprio funcionário, mesmo que o modelo erre um id
    const tickets = mine.filter((t) => chamados.includes(t.id)).map((t) => toTicketView(t, turn.now))
    turn.blocks.push({ kind: 'ticket_selector', tickets })
    return { output: { exibidos: tickets.map((t) => t.id) }, label: `mostrou ${tickets.length} chamados para escolha`, chips: [] }
  },
})

export const showTicket = defineTool({
  id: 'consultar_chamado',
  description:
    'Mostra o cartão de um chamado do funcionário com status, prazo e se está vencido. ' +
    'Se estiver vencido, ofereça chamar um analista (as opções aparecem sozinhas).',
  inputSchema: z.object({ chamado: z.string().describe('id do chamado, ex.: INC-20311') }),
  run: async ({ chamado }, turn) => {
    const { view } = await lookupTicket(turn, chamado)
    turn.blocks.push({ kind: 'ticket_card', ticket: view })
    if (view.overdue) turn.blocks.push({ kind: 'options', question: null, options: OVERDUE_OPTIONS })
    return {
      output: {
        id: view.id,
        status: view.status,
        prioridade: view.priority,
        prazo: view.slaLabel,
        vencido: view.overdue,
        ultimaAtualizacao: view.updatedAt,
      },
      label: `exibiu o cartão do ${view.id}`,
      chips: [],
    }
  },
})

export const prepareTicket = defineTool({
  id: 'preparar_rascunho_de_chamado',
  description:
    'Monta o rascunho de um chamado NOVO para o funcionário conferir. NÃO cria o chamado: ele aparece com os botões ' +
    'Confirmar/Editar/Cancelar. A prioridade é calculada pelo sistema a partir dos fatores. ' +
    'Só chame quando souber quem é afetado e se há urgência; se faltar, pergunte antes (use oferecer_opcoes). ' +
    'Se já existir chamado aberto sobre o mesmo problema, a resposta traz "duplicado" e você deve propor complementar aquele chamado.',
  inputSchema: z.object({
    tipo: z.enum(['INC', 'REQ']).describe('INC: algo parou ou não funciona. REQ: pedido de acesso, equipamento ou software'),
    titulo: z.string().min(5).max(90).describe('curto e específico, ex.: "VPN não conecta no notebook — erro 809"'),
    descricao: z
      .string()
      .min(10)
      .describe('o que acontece, desde quando, o que já foi tentado e o impacto, para o analista não precisar perguntar de novo'),
    categoria: z.enum(CATEGORIES),
    afetados: z.enum(['individual', 'equipe', 'empresa']),
    trabalhoParado: z.boolean().describe('o problema impede de trabalhar, sem alternativa'),
    compromissoHoje: z.boolean().describe('há reunião, entrega ou prazo hoje que depende disso'),
  }),
  run: async (input, turn) => {
    const result = await prepareCreateDraft(turn, {
      type: input.tipo,
      title: input.titulo,
      description: input.descricao,
      category: input.categoria,
      impact: input.afetados,
      workStopped: input.trabalhoParado,
      sameDayCommitment: input.compromissoHoje,
    })
    if (result.kind === 'duplicate') {
      return {
        output: {
          duplicado: true,
          chamadoExistente: { id: result.ticket.id, titulo: result.ticket.title, status: result.ticket.status },
          podeReabrir: result.reopen,
          instrucao: result.reopen
            ? 'Este problema já teve um chamado resolvido há menos de 7 dias. Proponha reabri-lo com preparar_atualizacao.'
            : 'Já existe chamado aberto sobre isso. Não crie outro: proponha complementar com preparar_atualizacao.',
        },
        label: `achou o ${result.ticket.id} sobre o mesmo problema`,
        chips: [`encontrou o ${result.ticket.id}`],
      }
    }
    turn.blocks.push({ kind: 'draft', draft: result.draft })
    return {
      output: {
        rascunho: result.draft.id,
        prioridade: result.draft.priority,
        motivoDaPrioridade: result.draft.priorityRule,
        prazo: result.draft.slaLabel,
        afetados: IMPACT_LABEL[result.draft.affected],
        instrucao: 'Explique em uma frase a prioridade e peça para conferir. O chamado só é criado quando ele confirmar.',
      },
      label: `montou o rascunho ${result.draft.id}`,
      chips: ['montou o rascunho'],
    }
  },
})

export const prepareUpdate = defineTool({
  id: 'preparar_atualizacao',
  description:
    'Monta um rascunho para COMPLEMENTAR um chamado aberto com informação nova, ou REABRIR um resolvido há até 7 dias. ' +
    'Não altera nada até o funcionário confirmar.',
  inputSchema: z.object({
    chamado: z.string(),
    informacao: z.string().min(5).describe('a informação nova, escrita para o analista ler'),
  }),
  run: async ({ chamado, informacao }, turn) => {
    const draft = await prepareUpdateDraft(turn, chamado, informacao)
    turn.blocks.push({ kind: 'draft', draft })
    return {
      output: { rascunho: draft.id, tipo: draft.kind === 'reopen' ? 'reabertura' : 'complemento', chamado: draft.targetTicketId },
      label: `preparou ${draft.kind === 'reopen' ? 'a reabertura' : 'o complemento'} do ${draft.targetTicketId}`,
      chips: [draft.kind === 'reopen' ? 'preparou a reabertura' : 'preparou a atualização'],
    }
  },
})

export const offerOptions = defineTool({
  id: 'oferecer_opcoes',
  description:
    'Mostra botões de resposta rápida para uma pergunta (2 a 4 opções curtas). Use para perguntar quem é afetado, ' +
    'se há urgência, tipo de problema etc. Escreva a pergunta também no seu texto.',
  inputSchema: z.object({
    pergunta: z.string().min(3),
    opcoes: z.array(z.string().min(1).max(40)).min(2).max(4),
  }),
  run: async ({ pergunta, opcoes }, turn) => {
    turn.blocks.push({ kind: 'options', question: pergunta, options: opcoes })
    return { output: { exibido: true }, label: `ofereceu opções: ${opcoes.join(' / ')}`, chips: [] }
  },
})

export const transferToAnalyst = defineTool({
  id: 'transferir_para_analista',
  description:
    'Transfere a conversa para um analista humano. Use quando: o funcionário pedir; o caso for crítico (algo parado ' +
    'para uma equipe ou a empresa); um chamado estiver vencido e ele aceitar ajuda; ou você não tiver segurança do que fazer. ' +
    'Depois disso você não responde mais nesta conversa.',
  inputSchema: z.object({
    motivo: z.enum(['pedido', 'critico', 'vencido', 'baixa_confianca']),
    explicacao: z.string().describe('por que está transferindo, em uma frase'),
    resumo: z
      .string()
      .min(20)
      .describe('resumo do caso para o analista: problema, o que já foi tentado, chamado relacionado e o que o funcionário espera'),
    chamado: z.string().nullable().describe('chamado relacionado, se houver'),
  }),
  run: async ({ motivo, explicacao, resumo, chamado }, turn) => {
    const result = await handOff(turn, { kind: motivo, reason: explicacao, summary: resumo, ticketId: chamado, confidence: null })
    return {
      output: { transferido: true, nivel: result.level, mensagemSugerida: result.text },
      label: `conversa na fila do ${result.level}`,
      chips: [],
    }
  },
})

export const nexoTools = {
  searchHelpCenter,
  listMyTickets,
  askTicketChoice,
  showTicket,
  prepareTicket,
  prepareUpdate,
  offerOptions,
  transferToAnalyst,
}
