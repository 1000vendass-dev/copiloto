# Banco de dados (Supabase / Postgres)

Projeto Supabase **Copiloto** (`wripjgkmgtdmzfclsoyq`, região sa-east-1). Migrations em `supabase/migrations/`.

## Tabelas

| Grupo | Tabela | Descrição |
|---|---|---|
| Usuários | `profiles` | nome, telefone, equipe padrão (1:1 com `auth.users`) |
| | `teams`, `team_members` | equipe/loja e papel (`owner`, `admin`, `member`) |
| CRM | `customers` | cadastro de clientes |
| | `leads` | negociações: etapa, temperatura, interesse, orçamento, prazo, troca, próxima ação, último contato |
| Estoque | `vehicles` | veículos (`search_text` gerado para busca), status, preços, loja, venda |
| | `vehicle_images` | fotos (caminho no Storage, posição, principal) |
| | `vehicle_features` | opcionais |
| Relacionamento | `activities` | **timeline** (contatos, mudanças de etapa, tarefas, visitas, propostas, notas, sistema) |
| | `notes` | contexto qualitativo |
| Rotina | `tasks` | tarefas / follow-ups |
| | `appointments` | visitas, test-drives, ligações, entregas |
| Negociação | `proposals` | valores, entrada, troca, financiamento, parcelas, status; `total` gerado |
| Organização | `tags`, `lead_tags`, `customer_tags`, `settings` | |
| IA | `ai_memory` | fatos duráveis que a IA deve lembrar |
| | `ai_action_logs` | auditoria de toda ação da IA (somente inserção/leitura) |
| | `ai_messages` | histórico da conversa por usuário |
| WhatsApp (preparado) | `whatsapp_accounts`, `whatsapp_contacts`, `whatsapp_conversations`, `whatsapp_messages` | ver WHATSAPP.md |

## Integridade entre equipes

Relações usam **chaves estrangeiras compostas** `(x_id, team_id)`: um lead da equipe A não consegue apontar para um veículo
da equipe B, mesmo que alguém descubra o id.

## RLS (resumo)

- Ler/criar/editar: membro da equipe (`private.is_team_member(team_id)`).
- Criar em nome de outro vendedor: só admin.
- Excluir: dono do registro ou admin.
- `activities`: timeline — só admin exclui.
- `ai_action_logs`: não pode ser alterado.
- `settings`, contas de WhatsApp: só admin altera.
- Storage: caminho `{team_id}/...`; só membros da equipe leem/enviam/excluem.
- Funções de apoio ficam no schema `private` (não exposto pela API).

Testes executados (revertidos): outra equipe não lê/edita/exclui/entra na equipe; usuário sem equipe não vê nada;
anônimo não vê nada; vendedor não exclui lead de outro nem altera configurações; FK composta bloqueia referência cruzada.

## Triggers de timeline

| Evento | Atividade gerada |
|---|---|
| lead criado | `lead_criado` |
| etapa alterada | `mudanca_etapa` / `venda` / `perda` (+ `closed_at`) |
| cliente criado | `cliente_criado` |
| tarefa criada / concluída | `tarefa_criada` / `tarefa_concluida` (+ `completed_at`) |
| compromisso criado | `compromisso_criado` |
| proposta criada / status | `proposta` |
| contato registrado (ligação, WhatsApp, e-mail, visita, test-drive) | atualiza `leads.last_contact_at` |

## Funções

- `dashboard_metrics(team)` — métricas do painel (SECURITY INVOKER, respeita RLS).

## Dados

- 280 veículos migrados do projeto antigo (`1000vendass-dev's Project`), com opcionais; carroceria classificada pelo modelo.
- O projeto antigo continua intacto.
