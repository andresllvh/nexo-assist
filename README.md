# Nexo Assist

Agent de atendimento do service desk de TI da Nexo (desafio técnico da Beyond the Bytes).

O funcionário descreve o problema num chat e o agent decide o que fazer a cada mensagem: responde com a central de ajuda, consulta ou complementa um chamado, monta um rascunho de chamado para confirmação ou chama um analista. Do outro lado, o analista tem um console para assumir conversas, responder e devolvê-las ao agent.

**Versão publicada:** https://nexo-assist-snowy.vercel.app (contas de exemplo abaixo, qualquer senha).

**A parte que mais cuidei foi a transparência:** acima de cada resposta aparecem as ações do agent ("consultou seus chamados", "classificou a prioridade"), e o botão **Como decidi** abre o que ele entendeu, que ação tomou, com que segurança, por quê e o passo a passo com entrada, saída, tempo e novas tentativas de cada ferramenta.

## Como rodar

Requer Node.js 22.18 ou superior.

```bash
npm install
cp .env.example .env    # preencha GOOGLE_GENERATIVE_AI_API_KEY e SESSION_SECRET
npm run dev             # http://localhost:3000
```

A chave do Gemini é gratuita em [Google AI Studio](https://aistudio.google.com/apikey). O banco (SQLite) é criado e populado sozinho na primeira execução.

**Contas de exemplo** (qualquer senha):

| E-mail | Perfil | Para testar |
|---|---|---|
| `ana.souza@nexo.com.br` | funcionária (Windows 11) | chamado vencido, chamado resolvido há 4 dias, VPN erro 809 |
| `carla.mendes@nexo.com.br` | funcionária (Windows 10) | o artigo do erro 809 vale para ela |
| `diego.ramos@nexo.com.br`, `bruno.tavares@nexo.com.br` | funcionários | outros chamados (privacidade) |
| `rafael.lima@nexo.com.br` | analista N2 | console do analista |
| `julia.costa@nexo.com.br` | analista N1 | console do analista |

**Roteiro rápido:** entre como Ana e peça "Qual o status do meu chamado?", escolha o INC-20311 (vencido) e aceite falar com um analista. Depois entre como Rafael em outra janela anônima, assuma a conversa e responda. Para abrir um chamado: "Meu notebook não conecta na VPN, erro 809" e depois "Só eu, tenho reunião às 14h".

Outros comandos:

```bash
npm test            # testes (Vitest)
npm run typecheck   # TypeScript estrito
npm run eval        # avaliação da etapa de entendimento (chama o modelo)
npm run db:seed     # recria o banco com os dados de exemplo
```

## Arquitetura

```
 Interface (Next.js, React)            Agent (Mastra)                     Serviços
┌──────────────────────────┐     ┌────────────────────────────┐     ┌──────────────────────────┐
│ /entrar     login        │     │ 1. ações de botão → regra   │     │ Serviço de chamados      │
│ /atendimento chat        │ ──▶ │ 2. etapa de entendimento    │ ──▶ │ (legado simulado: cai às │
│ /console    analista     │ API │ 3. regras no código         │     │ vezes; cliente com novas │
│                          │     │ 4. agent com ferramentas    │     │ tentativas)              │
│  streaming NDJSON        │ ◀── │    trace de cada passo      │     │ Central de ajuda         │
└──────────────────────────┘     └────────────────────────────┘     │ Conversas e rascunhos    │
                                                                       └───────────┬──────────────┘
                                                                                   ▼
                                                                         SQLite (libsql), 1 arquivo
```

```
src/
  domain/            regras do Anexo A em funções puras: prioridade, prazos em horas úteis, duplicidade
  server/
    tickets/         serviço de chamados (interface + implementação simulada) e cliente com novas tentativas
    helpcenter/      artigos e busca
    conversations/   conversas, mensagens, rascunhos e estado (agent / aguardando / analista / encerrada)
    agent/           entendimento, agent Mastra, ferramentas, operações e o orquestrador de cada resposta
    auth/            sessão em cookie assinado (HMAC)
    console.ts       ações do analista
  shared/chat.ts     tipos trocados entre servidor e interface (mensagens, blocos, trace)
  app/               páginas e rotas da API
  components/        chat, console e componentes visuais
scripts/             avaliação das decisões e seed
```

Decisões de arquitetura:

- **Agent separado do sistema de chamados.** O agent só conhece a interface `TicketService`. A implementação simulada fica em `server/tickets` e pode ser trocada por um cliente HTTP do sistema real sem mexer no agent.
- **Legado instável de propósito.** Cada chamada ao serviço de chamados tem uma chance de falhar (`TICKETS_FAILURE_RATE`, 10% por padrão). O cliente tenta de novo com espera crescente (300 ms, 800 ms) e o painel de decisão mostra quantas novas tentativas houve. Cada operação faz uma única chamada ao legado, no começo, para uma nova tentativa nunca gravar um chamado duplicado (há teste para isso).
- **Persistência.** Conversas, mensagens, rascunhos, chamados e o estado de cada conversa ficam num arquivo SQLite (`data/nexo.db`, via libsql). Reiniciar a aplicação não perde nada, e o funcionário volta para a última conversa não encerrada. A mesma URL pode apontar para um Turso em produção.
- **Streaming.** `POST /api/chat` devolve NDJSON: primeiro o entendimento, depois cada passo conforme acontece, os pedaços do texto e a mensagem final. A interface mostra tudo em tempo real.

## Como o agent decide

Cada mensagem passa por quatro etapas (`src/server/agent/turn.ts`):

1. **Ações de botão são resolvidas no código, sem modelo.** Confirmar ou cancelar um rascunho e escolher um chamado na lista não precisam de IA: é mais rápido, não custa nada e não tem como errar.
2. **Etapa de entendimento.** Um modelo leve, com saída estruturada (`router.ts`), devolve a intenção (`abrir_chamado`, `consultar_chamado`, `falar_com_analista`, `fora_do_escopo` etc.), o que entendeu numa frase, a confiança (0 a 1) e o motivo. É isso que aparece em "Como decidi".
3. **Regras que não dependem do modelo:**
   - pediu analista → transfere. Se o chamado da conversa estiver vencido, vai para o N2;
   - confiança abaixo de 50% → o agent pede para a pessoa explicar melhor. Se a próxima mensagem também ficar abaixo, chama um analista;
   - "pode criar" com rascunho pendente → cria o chamado, pelo mesmo caminho do botão Confirmar.
4. **Agent com ferramentas (Mastra).** Recebe as regras do service desk, o perfil do funcionário (inclusive o sistema operacional do notebook, que decide se um artigo vale), os chamados dele e os artigos relevantes já consultados. As 8 ferramentas são: buscar na central, listar chamados, mostrar a escolha de chamado, consultar um chamado, preparar o rascunho, preparar a atualização ou reabertura, oferecer opções e transferir para um analista.

**As regras do Anexo A ficam no código, não só no prompt:**

| Regra | Onde é garantida |
|---|---|
| Prioridade (impacto × urgência) e prazo | o modelo informa só os fatores; `classifyPriority` e `computeDueAt` calculam, com horas úteis de 8h às 18h |
| Confirmar antes de criar ou alterar | as ferramentas só criam rascunhos; o chamado só nasce em `confirmDraft`, por botão ou "pode criar" |
| Sem duplicidade | `findDuplicate` roda antes de todo rascunho; se há chamado aberto parecido, o agent propõe complementar; resolvido há até 7 dias pode ser reaberto |
| Transferência em caso crítico | ao confirmar um chamado crítico, a conversa vai direto para o N2 |
| Agent não responde com analista na conversa | o orquestrador para antes de chamar o modelo quando o estado é "aguardando" ou "com analista" |
| Privacidade | nenhuma ferramenta recebe o id do funcionário: ele vem da sessão pelo `RequestContext` do Mastra, e o serviço de chamados filtra por quem pergunta |
| Escopo (só TI) | intenção `fora_do_escopo` e instrução para indicar o canal certo (RH, Facilities) |

## Como garanti a qualidade das decisões

- **Testes (Vitest, 33):** regras de prioridade, horário útil, vencimento, duplicidade e reabertura; privacidade (um funcionário não vê nem descobre que existe chamado de outro); novas tentativas do legado sem duplicar chamado; rascunho que não pode ser confirmado duas vezes; transferência; histórico enviado ao modelo.
- **Avaliação da etapa de entendimento (`npm run eval`):** 19 mensagens com a intenção esperada, incluindo respostas curtas que dependem do contexto ("Só eu", "pode criar"), correções de rascunho e duas mensagens ambíguas de propósito. Resultado com `gemini-3.5-flash-lite`:

  | Métrica | Resultado |
  |---|---|
  | Intenção correta | 19/19 |
  | Ambíguas com confiança abaixo de 50% | 2/2 |
  | Casos claros tratados como incertos | 0/17 |

  A avaliação achou dois problemas, que corrigi. "O sistema de faturamento caiu para toda a equipe do Financeiro" era classificado como fora do escopo: o modelo confundia o departamento com o assunto. Escrevi a regra no prompt com um exemplo diferente do caso testado, para não ajustar o prompt à prova. E as mensagens ambíguas ficavam exatamente em 40%, no limite antigo; mudei o limite para 50% e a política para "pergunta primeiro, transfere se continuar".

  **Limitação:** são frases escritas por mim, então o conjunto é pequeno e pode ter viés. Também não avalia conversas inteiras nem a qualidade do texto gerado.
- **Testes manuais no navegador** dos fluxos das 5 telas: abrir chamado, consultar vencido, transferir, assumir, responder, devolver, encerrar e reiniciar o servidor no meio.

## Trade-offs

- **Duas chamadas ao modelo por mensagem** (entendimento + agent). Custa mais que uma, mas deixa a decisão auditável e permite regras no código antes de agir. Para compensar, os chamados e os artigos vão pré-carregados no contexto (corta passos de ferramenta), o histórico é limitado às últimas 14 mensagens e o modelo "pensa" pouco (`thinkingLevel: low`).
- **Modelo padrão `gemini-3.5-flash-lite`.** É rápido (3 a 5 s por resposta) e barato. O `gemini-3.5-flash` decide um pouco melhor; basta trocar `NEXO_MODEL`. No plano gratuito do Gemini o limite é baixo (no meu teste, 5 requisições por minuto e 20 por dia no `flash`), por isso deixei o `flash-lite` como padrão e a interface trata o limite com uma mensagem clara.
- **Consulta periódica (3 s) em vez de WebSocket** para o console e para o funcionário quando há um analista. É mais simples e suficiente para o volume do desafio.
- **Serviço de chamados no mesmo processo**, separado por interface, em vez de um serviço HTTP à parte. Menos infraestrutura para rodar; a troca está isolada em um arquivo.
- **Mensagens das ações de botão escritas no código** ("Pronto: abri o INC-20517…"). Perde um pouco de naturalidade e ganha previsibilidade e custo zero.
- **Login de demonstração:** aceita qualquer senha para os e-mails de exemplo, como o PRD pede. A sessão é um cookie `httpOnly` assinado com HMAC.

## O que eu faria com mais tempo

- Avaliar conversas inteiras (várias mensagens) e a qualidade das respostas, com um modelo juiz e uma amostra revisada por pessoas.
- Chave de idempotência nas chamadas ao sistema de chamados real e o serviço como API HTTP separada.
- Eventos em tempo real (SSE ou WebSocket) no console, com aviso de novas conversas na fila.
- Testes ponta a ponta com Playwright dos fluxos principais.
- Limite também por IP e alertas de custo no deploy.
- Busca na central de ajuda por significado (embeddings) quando houver mais artigos.

## Deploy

Publicado na Vercel: **https://nexo-assist-snowy.vercel.app**

- **Banco:** Turso (libsql na nuvem), conectado pela integração da Vercel. O código lê `DATABASE_URL` ou as variáveis que a integração cria (`DATABASE_TURSO_DATABASE_URL` e `DATABASE_TURSO_AUTH_TOKEN`). Na primeira requisição, as tabelas são criadas e os dados de exemplo inseridos.
- **Chaves:** `GOOGLE_GENERATIVE_AI_API_KEY` e `SESSION_SECRET` ficam só nas variáveis de ambiente da Vercel, marcadas como secretas. O `.vercelignore` impede que o `.env` local e o banco local subam junto com o código.
- **Limite de uso, contra abuso e custo inesperado:**
  - até 60 mensagens por funcionário por hora (`NEXO_LIMIT_PER_HOUR`);
  - teto de 500 respostas do agent com o modelo por dia no sistema todo (`NEXO_LIMIT_PER_DAY`);
  - além das 30 mensagens por sessão.

  Ao chegar no limite, a interface explica o motivo e indica o ramal do service desk.
- **Como publiquei:**
  1. `vercel link`;
  2. criar o banco Turso em Storage, no painel do projeto;
  3. `vercel env add` para as duas chaves;
  4. `vercel --prod`.

Como é uma demonstração com login aberto, todos os avaliadores compartilham os mesmos dados de exemplo.

## Uso de IA

Usei ferramentas de IA para programar, como o desafio permite. As decisões de arquitetura, as regras e os testes estão descritos acima e eu consigo explicar e alterar cada parte.
