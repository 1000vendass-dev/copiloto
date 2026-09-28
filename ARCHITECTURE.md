# Arquitetura

> **O Claude interpreta, o aplicativo executa, o Supabase guarda e a Vercel publica.**
> A conversa com a IA nunca é a única memória do negócio — o banco é.

```
Usuário (celular / computador, PWA)
   │
   ▼
Next.js (Vercel, região gru1)
   ├── Páginas (Server Components) ── leem o banco com a sessão do usuário
   ├── Server Actions ─────────────── validam (zod) e gravam no banco
   ├── /api/copiloto ──────────────── loop de IA: Claude ⇄ ferramentas ⇄ banco
   └── middleware ─────────────────── renova sessão e protege rotas
   │
   ▼
Supabase
   ├── Auth (e-mail + senha, sessão em cookies via @supabase/ssr)
   ├── Postgres + RLS (tudo filtrado por equipe no próprio banco)
   ├── Triggers (timeline automática, datas de fechamento, último contato)
   └── Storage (fotos privadas, links assinados de 1h)
```

## Pastas

```
src/
  app/                 rotas (App Router)
    (auth)/            login, cadastro, recuperação de senha
    (app)/             telas autenticadas (layout com menu lateral / barra inferior)
    api/copiloto/      endpoint do assistente
    auth/              confirmação de e-mail e nova senha
  features/            lógica por domínio (queries, actions, componentes)
    crm/  inventory/  routine/  proposals/  ai/  auth/  settings/
  components/          UI genérica (botões, cards, layout)
  lib/                 supabase (client/server/middleware), auth, datas, formulários
  types/               tipos das tabelas
supabase/migrations/   todas as alterações do banco, em ordem
```

## Princípios

1. **Segurança no banco, não só na tela.** Toda tabela tem RLS por `team_id`. O servidor usa a chave pública + sessão do
   usuário — não existe chave de serviço no app. Mesmo que a tela tenha um bug, o banco não entrega dados de outra equipe.
2. **Validação no servidor.** Toda Server Action valida com zod; a validação do navegador é só conforto.
3. **Timeline por trigger.** Criar lead, mudar etapa, criar tarefa, agendar, criar proposta geram atividade no banco —
   independente de a ação vir da tela ou da IA.
4. **Sem dados falsos.** Telas sem dados mostram "Nenhum registro encontrado". Não há mocks.
5. **Multi-vendedor pronto.** `teams`, `team_members` (dono/admin/vendedor), `owner_id` e `team_id` em todo registro.
6. **Datas em America/Sao_Paulo** (`src/lib/dates.ts`).
