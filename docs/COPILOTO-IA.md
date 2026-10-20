# Copiloto IA: memória, rotinas, autonomia e personalidade (design)

> Status (20/10/2026): **Fase 1 implementada** (aba IA, perfil, rotina da noite, relógio de hora em hora, Veio na loja).
> Fases 2 e 3 seguem como proposta.
> Missão da IA: **extrair todo o potencial do vendedor com a ferramenta.** O mundo dela é o vendedor e o CRM:
> ela trata os dados sozinha, aprende com eles (memória que se retroalimenta), fala com o vendedor por
> iniciativa própria (briefing, alertas, revisões, conselhos) e tudo é configurável numa aba própria do app,
> pensada para cada pessoa personalizar a sua IA (produto comercializável).

## 0. Viabilidade (revisão honesta)

| Ponto | Situação | Conclusão |
|---|---|---|
| Recursos da VPS | 3,8 GB RAM, 1,5 GB livres, 2 CPUs. Relógio novo ≈ 10 MB | ✅ cabe |
| Tempo da rotina da noite | ~30 leads/dia × 1 chamada (~10–20 s cada, 2 em paralelo) ≈ 5–10 min | ✅ cabe, roda de madrugada |
| Limite da assinatura do Claude (uso pessoal) | lote à noite, quando você não usa; incremental; para e continua se acabar | ✅ viável para **você** |
| Base multiusuário | dados já separados por equipe (team) com RLS; `settings` por equipe já existe | ✅ boa base |
| **Vender usando a sua assinatura do Claude** | a ponte usa a **sua conta pessoal**; atender outras pessoas com ela viola os termos de uso | ❌ **para vender, a IA de cada cliente roda na API paga** (custo por uso). O design já separa o "motor" (assinatura só para o dono; API para os demais) e mede o consumo de cada equipe |
| **WhatsApp de vários clientes** | o WAHA gratuito (Core) tem **1 sessão** só (o seu número) | ❌ para vender: WAHA Plus (várias sessões) ou um WAHA por cliente; e servidor maior |
| Prompt injection (cliente escrevendo "regras") | memória com origem/confiança/status; texto de cliente nunca vira regra | ✅ tratado no design |

**Resumo:** para o **seu uso**, tudo é viável já. Para **vender**, o design fica pronto desde agora
(configuração por usuário/equipe, motor de IA trocável, medição de uso), mas antes de ter o 1º cliente pagante
é preciso: API paga por cliente (ou por plano), WhatsApp multi-sessão e um servidor maior. Isso é a "Fase
Comercial", depois das 3 fases abaixo.

## 1. Princípios (o que impede isto de virar bagunça)

1. **SQL calcula, IA escreve.** Números (taxas, atrasos, dados faltando) saem de query; a IA interpreta e redige.
2. **Saída da IA sempre validada** (JSON num schema zod). Inválido → 1 nova tentativa → registra erro e segue.
3. **Incremental e idempotente.** Lead guarda até onde foi resumido; cada rotina tem chave única por período.
4. **A IA nunca envia mensagem ao cliente** e nunca muda etapa do funil sozinha (só sugere). Em qualquer nível,
   em qualquer personalidade. Isto é **núcleo travado**: não aparece nas configurações.
5. **Texto de cliente é dado, nunca instrução.** Memórias têm origem, confiança e status; você aprova o que é incerto.
6. **Sem spam:** prioridade, horário silencioso, limite por dia, agrupamento.
7. **Custo sob controle:** modelo por tarefa, orçamento por execução e por dia, consumo medido por equipe.
8. **Tudo observável:** cada execução registrada e com "Rodar agora".

## 2. Personalidade (camadas)

```
[núcleo travado]   regras de segurança e da plataforma (nunca enviar, dados ≠ instruções, missão, limites)
[personalidade]    nome, estilo, tom, energia, emojis, tratamento ("você"/"chefe"/nome), idioma
[o que ela sabe]   memória da loja + do vendedor + padrões (se retroalimenta)
[suas instruções]  texto livre: "seja direto", "me cobre meta", "sempre puxe para visita"
```

- **Modelos prontos** para começar e depois ajustar: *Parceiro* (próximo, motivador), *Coach* (cobra meta,
  direto), *Analista* (números, objetivo), *Mentor* (explica e ensina, liga com o modo aula do caderno).
- Ela **fala com você**: apresenta-se pelo nome que você der, lembra do seu jeito, comemora vendas, cobra o que
  ficou para trás e dá conselhos de venda com base nos seus dados.
- **Mundo da IA = você + CRM.** Perguntas fora disso ela responde rapidinho e puxa de volta para vendas
  (configurável: "pode conversar sobre outros assuntos").

## 3. As 3 camadas de memória

| Camada | O que guarda | Quem escreve | Onde a IA usa |
|---|---|---|---|
| **Loja e vendedor** | endereço, horário, política (estoque a partir de R$ 25 mil, avaliação presencial), seu jeito de abordar, preferências | rotina da noite (aprende das conversas) + você | em toda conversa e rotina |
| **Cliente** | resumo vivo do lead + fatos duráveis + resumo de cada dia | rotina da noite | ao citar/abrir o lead: lê o resumo, **não relê mensagens antigas** |
| **Padrões** | o que funciona e onde trava | revisão (frequência configurável) | briefing, relatórios, conselhos |

Toda memória: `scope`, `content`, `source` (você · rotina · chat), `confidence`, `status`
(`ativa` · `sugerida` · `arquivada`), `evidence`, datas. A IA propõe operações (adicionar / atualizar /
arquivar) em vez de só acumular. Memória incerta de loja/vendedor entra como **sugerida** e espera seu OK.

## 4. Rotinas automáticas

Um **relógio** (container `copiloto-cron`) chama `/api/jobs/tick` **de hora em hora, só das 06h à meia-noite** (de madrugada a IA
não trabalha e não gasta nada). A janela e o horário de cada rotina ficam no banco, por usuário, então tudo muda pelo app.
Uma rotina marcada para 21h roda na checagem das 21h; se falhar, tenta de novo nas próximas (até 3 vezes).

| Rotina | Padrão (configurável) | O que faz |
|---|---|---|
| **Rotina da noite** | 21h30 | por lead com novidade: resumo do dia, resumo vivo, fatos, travas/objeções/sinais, próxima ação → tarefa (sem duplicar), sugestão de etapa/temperatura; dados faltando (SQL); relatório no chat + notificação; aprende memória da loja/vendedor |
| **Briefing da manhã** | 7h | prioridades com motivo, agenda, quem chamar; nível 2: rascunho pronto em cada follow-up |
| **Vigia** (Fase 2) | de hora em hora no horário comercial | cliente esperando há X min, lead quente sem próxima ação, visita sem confirmação → alerta (só SQL) |
| **Revisão** | diária / semanal / quinzenal / mensal, dia e hora | lead → visita, onde trava, o que funcionou, metas; atualiza Padrões |

## 5. Níveis de autonomia

| Nível | Faz sozinho | Nunca faz |
|---|---|---|
| **0** | só age quando você pede no chat | enviar ao cliente |
| **1** | rotinas (resumos, memória, tarefas, relatório, briefing, alertas) | enviar ao cliente, mudar etapa |
| **2** | nível 1 + rascunhos de follow-up prontos no card | enviar ao cliente, mudar etapa |

## 6. Nova aba: **IA** (menu próprio, separada de Configurações)

Cada usuário configura a **sua** IA (comercializável). Seções:

1. **Identidade:** nome da IA, avatar/emoji, modelo de personalidade, tom, emojis, tratamento, idioma.
2. **Missão e metas:** suas metas (vendas/mês, visitas/semana), o que ela deve cobrar, foco (ex.: lead → visita).
3. **Autonomia:** nível 0/1/2 + liga/desliga de cada rotina.
4. **Rotinas e horários:** noite, briefing, vigia (horário comercial), revisão (frequência, dia, hora).
5. **Alertas:** quais tipos, tempo máximo sem resposta, horário silencioso, limite por dia, notificação no celular.
6. **Memória:** lista por camada; editar, arquivar, aprovar sugeridas, adicionar; "esquecer tudo sobre X".
7. **Suas instruções:** texto livre que ela sempre segue (dentro do núcleo travado).
8. **Atividade:** execuções recentes, o que fizeram, erros, consumo; botão **Rodar agora**.
9. **Motor** (só dono da equipe): assinatura (uso pessoal do dono) ou API; orçamento diário.

## 7. Dados (migrations)

- `ai_profiles` (1 por usuário): identidade, personalidade, metas, autonomia, horários, alertas, instruções (jsonb versionado).
- `ai_engine` em `settings` da equipe: motor (assinatura/API), modelo por tarefa, orçamento.
- `ai_memory` (já existe): + `status`, `source`, `confidence`, `evidence`; escopos `loja`, `vendedor`, `cliente`, `padrao`.
- `leads`: + `ai_summary`, `ai_summary_at`, `ai_insights` (jsonb).
- `lead_daily_summaries`: lead, dia, resumo, travas, próxima ação, sugestões (único por lead+dia).
- `copilot_runs`: rotina, usuário, período, status, estatísticas, erros (trava + histórico).
- Consumo: na Fase 1 fica em `copilot_runs.stats` (tokens e chamadas por execução). A tabela `ai_usage` por equipe entra na Fase 4 (cobrança).
- `tasks`: + `source` (`voce` · `ia`). `ai_messages`: `meta.kind` para mensagens proativas.
- Captura: botão **Veio na loja** (activity `visita`), origem do lead sugerida/obrigatória.

## 8. Peças de código

- Ponte: `POST /v1/json` `{ system, prompt, schema, model }` → JSON validado (sem ferramentas).
- `src/features/copilot/`: `engine.ts` (assinatura ou API, por equipe, com medição), `llm.ts` (chamada estruturada
  + validação + orçamento), `persona.ts` (monta as camadas de personalidade), `memory.ts`, `jobs/` (`tick`,
  `nightly`, `briefing`, `watchdog`, `review`), `quality.ts` (checagens SQL), `profile.ts` (configurações).
- `src/app/(app)/ia/`: a aba IA. `src/app/api/jobs/[job]/route.ts` protegida por `JOBS_TOKEN`.

## 9. Pré-requisitos

1. **Desligar o robô do DeskcommCRM** no seu número (senão a IA aprende com um robô).
2. **Botão Veio na loja** e **origem do lead** (sem isso não há lead → visita nem canal).

## 10. Fases

1. **Fundação + rotina da noite + aba IA (básica):** tabelas, motor com medição, relógio, `/v1/json`, aba IA com
   Identidade/Personalidade, Autonomia, Rotinas/horários e Atividade; rotina da noite completa (resumos, memória do
   cliente, tarefas, dados faltando, relatório na voz da personalidade + push); Veio na loja; origem.
2. **Manhã, alertas e memória viva:** briefing, rascunhos (nível 2), vigia, memória loja/vendedor que se
   retroalimenta, seções Memória, Alertas, Metas e Suas instruções na aba IA.
3. **Revisão e refinamentos:** revisão com frequência configurável + Padrões, IA vendo fotos, conselhos de venda.
4. **Comercial (quando houver cliente):** API por cliente/plano e cobrança pelo `ai_usage`, WAHA multi-sessão,
   onboarding de nova loja, servidor maior.
