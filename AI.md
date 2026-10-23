# Copiloto (IA)

## Fluxo

```
Usuário → /api/copiloto → Claude interpreta → escolhe ferramenta → ferramenta consulta/grava no Supabase
       ← resposta ← Claude redige ← resultado da ferramenta ←────────────────────────────────┘
```

A IA **nunca** responde dados de memória: o prompt de sistema obriga o uso de ferramentas e proíbe inventar clientes,
veículos, preços ou contagens. As ferramentas usam a **sessão do usuário** — a IA não tem mais permissão do que ele.

## Modo proativo: toda mensagem vira ação

O prompt (`STATIC_PROMPT` em `agent.ts`) manda a IA registrar sem pedir permissão. Qualquer relato sobre um cliente
dispara **`registrar_atendimento`** (`interaction.ts`), que numa única chamada:

1. encontra o lead (id → telefone → nome) ou cria; se houver dois parecidos, devolve candidatos;
2. atualiza interesse, orçamento, pagamento, troca, prazo, temperatura, origem, veículo (por código de estoque);
3. registra o contato na timeline e salva o contexto qualitativo como nota;
4. cria agendamento (visita/test-drive) e/ou follow-up;
5. sem agendamento nem follow-up, cria **follow-up automático em 2 dias úteis às 09:00** — a menos que já exista
   um follow-up pendente futuro;
6. ajusta próxima ação e etapa (novo → primeiro contato; com agendamento → visita);
7. alerta se outro cliente em aberto quer o mesmo carro.

Também: `create_vehicle` (carro que chegou) e `share_vehicle` (link da ficha com preço personalizado + texto e
link de WhatsApp).

## Economia de tokens

- **Prompt caching**: parte fixa do prompt + ferramentas marcadas com `cache_control` (leituras custam ~10%).
  Data/hora, memórias e lojas vão num bloco separado, fora do cache.
- A última mensagem de cada passo também é ponto de cache, então os passos seguintes do loop pagam só o trecho novo.
- Histórico enviado: só as **6 últimas mensagens** de texto. O contexto de negócio vem do banco pelas ferramentas.
- `max_tokens` 1000; resultados de ferramenta limitados a 12 KB; respostas curtas por regra do prompt.
- O consumo de cada resposta fica em `ai_messages.meta.usage` (entrada, saída, cache lido/gravado).
- Modelo padrão: **`claude-haiku-4-5`** (o mais barato). O prompt foi escrito para ele: árvore de decisão (qual ferramenta),
  guia campo a campo do `registrar_atendimento`, 8 exemplos mensagem → chamadas e tabela pronta dos próximos 8 dias
  (evita erro de data). Para trocar, defina `COPILOTO_MODEL` na Vercel (ex.: `claude-sonnet-5`).

## Ferramentas (`src/features/ai/tools.ts`)

Leads: `search_leads`, `get_lead`, `create_lead`, `update_lead` · Clientes: `search_customers`, `get_customer`,
`create_customer`, `update_customer` · Estoque: `search_vehicles` (entende "onix até 80 mil"), `get_vehicle`,
`update_vehicle` · Rotina: `create_task`, `update_task`, `complete_task`, `search_tasks`, `create_appointment`,
`search_appointments` · Timeline: `create_activity`, `search_activities`, `create_note`, `search_notes` ·
Propostas: `search_proposals`, `create_proposal`, `update_proposal` · Prioridades: `who_to_call_today` ·
Memória: `save_memory` · Atendimento: `registrar_atendimento` · Estoque: `create_vehicle` · Ficha: `share_vehicle`.

Nomes ambíguos ("João" com dois leads) → a ferramenta devolve candidatos e a IA pergunta qual.

## Confirmação (ações de alto risco)

Marcar venda/perda, alterar status ou preço de veículo e aceitar proposta exigem `confirmed=true` **e** que a última
mensagem do usuário seja uma confirmação explícita ("sim", "confirmo"...). Sem isso a ferramenta devolve
`needs_confirmation` e a IA pergunta. A IA **não tem ferramenta de exclusão**.

## Auditoria

Toda chamada de ferramenta grava em `ai_action_logs`: usuário, comando, ferramenta, entrada, resultado, status
(`sucesso`, `erro`, `pendente_confirmacao`). A tabela não aceita alteração.

## Memória em três camadas

1. **Estruturada** — campos do lead/cliente/veículo (interesse, orçamento, prazo...).
2. **Contexto** — `notes` e `ai_memory` ("usa o carro para trabalhar, tem urgência").
3. **Histórico** — `activities` (timeline).

`get_lead` reconstrói o contexto lendo as três. O histórico do chat (`ai_messages`) é só conveniência para retomar
a conversa em outro aparelho.

## Empresa de agentes: o chat é o CSO

O Copiloto é a ferramenta do departamento Comercial da empresa de agentes do dono (quadro de tarefas no
`empresa-db`, fora do Supabase). Com `QUADRO_API_URL` configurada:

- **Chat = CSO (Diretor Comercial).** O bloco `EMPRESA_BLOCK` (`persona.ts`) entra só no chat. As ferramentas
  `quadro_consultar`/`quadro_agir` (`quadro.ts`) falam com a API do quadro usando a chave do cargo (`QUADRO_API_TOKEN`).
  Quadro da empresa ≠ agenda de clientes: lembrete de cliente continua em `registrar_atendimento` (regra I do prompt).
- **Follow-up (`followup.ts`)** é o DONO dos follow-ups do vendedor (Nível 2, com `QUADRO_API_TOKEN_FOLLOW_UP`, de hora
  em hora das 7h às 21h). Não é regra fixa: para cada cliente decide rascunho / aguardar / encerrar, quando é o
  próximo contato e o que fazer com cada tarefa pendente do lead (remarcar e assumir, concluir ou manter). O plano
  fica em `leads.ai_insights.followup`; as tarefas que assume passam a `source = follow_up` (uma por cliente). O código
  só guarda as proteções: nada é enviado; cliente que falou por último é do dono e etapa "novo" é do SDR; um rascunho
  pendente por cliente e um do Follow-up a cada 20h; intervalo mínimo desde a última mensagem do vendedor (aba IA,
  `routines.followup.semRespostaHoras`, padrão 6h). Só olha um cliente quando chega a data planejada, vence uma
  tarefa, o cliente está sem plano ou a conversa andou. A rodada das 7h manda o plano do dia no chat.
- **Cada tarefa tem um dono.** A rotina da noite não cria nem mexe em tarefa de lead que já tem tarefa pendente de um
  agente (`follow_up`, `sdr`, `pos_venda`); a sugestão dela fica no resumo do dia para o agente usar.
- **SDR (`sdr.ts`)** também é Nível 2 (com `QUADRO_API_TOKEN_SDR`): lead novo, etapas "novo" e "primeiro_contato". A cada
  15 min das 7h às 21h (mensagem fora do horário espera a janela abrir). Entra quem tem a ÚLTIMA mensagem do cliente
  (2+ min), sem rascunho pendente e sem rascunho do SDR depois dela. A IA responde com o estoque real (sem preço),
  faz UMA pergunta de qualificação e preenche só campos VAZIOS do cadastro (interesse, orçamento, pagamento, troca,
  prazo, origem). Não muda etapa: do atendimento em diante é o dono. Rascunho `source = sdr`, linha na timeline,
  resumo no chat com botão. Tarefa "SDR do dia" no quadro, entregue às 22h.
- **Feedback do dia (`feedback.ts`), 22h:** cada agente mede o próprio trabalho das últimas 24h (rascunho enviado como
  estava, editado, descartado, cliente respondeu), escreve o que funcionou e propõe até 2 ajustes nas próprias
  instruções. Cada ajuste vira pedido de aprovação no quadro (página do CEO); aprovado, entra no prompt do agente
  (`aprendizados.ts`). Também entrega a tarefa do dia no quadro.
- **Revisão do CSO (`revisao-cso.ts`), 22h30:** regra "um faz, outro revisa". O CSO revisa as entregas do dia da equipe
  (tarefas em revisão no quadro), conclui cada uma com parecer, registra elogio ou erro para o RH quando há
  evidência, opina sobre os ajustes que a equipe pediu (a decisão é do dono) e entrega o "Relatório do Comercial"
  para o CEO no quadro. O resumo vem para o chat.
- O relógio (`copiloto-cron`) chama `tick` a cada 15 min; as rotinas de hora em hora não duplicam (período em
  `copilot_runs`).

## Configuração

`ANTHROPIC_API_KEY` (obrigatória) e `COPILOTO_MODEL` (opcional, padrão `claude-sonnet-5`). Sem chave, a tela mostra
aviso e o restante do app funciona.

## Testes obrigatórios (protocolo §24)

1. "Crie um lead chamado João." → lead no banco
2. "João quer um Onix de até 80 mil." → lead atualizado
3. "Registra que falei com João hoje." → activity
4. "Me lembra de falar com João amanhã." → task
5. "Quais Onix tenho até 80 mil?" → consulta real
6. "Quem eu preciso chamar hoje?" → análise real
