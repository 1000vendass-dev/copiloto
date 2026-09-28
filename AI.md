# Copiloto (IA)

## Fluxo

```
Usuário → /api/copiloto → Claude interpreta → escolhe ferramenta → ferramenta consulta/grava no Supabase
       ← resposta ← Claude redige ← resultado da ferramenta ←────────────────────────────────┘
```

A IA **nunca** responde dados de memória: o prompt de sistema obriga o uso de ferramentas e proíbe inventar clientes,
veículos, preços ou contagens. As ferramentas usam a **sessão do usuário** — a IA não tem mais permissão do que ele.

## Ferramentas (`src/features/ai/tools.ts`)

Leads: `search_leads`, `get_lead`, `create_lead`, `update_lead` · Clientes: `search_customers`, `get_customer`,
`create_customer`, `update_customer` · Estoque: `search_vehicles` (entende "onix até 80 mil"), `get_vehicle`,
`update_vehicle` · Rotina: `create_task`, `update_task`, `complete_task`, `search_tasks`, `create_appointment`,
`search_appointments` · Timeline: `create_activity`, `search_activities`, `create_note`, `search_notes` ·
Propostas: `search_proposals`, `create_proposal`, `update_proposal` · Prioridades: `who_to_call_today` ·
Memória: `save_memory`.

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
