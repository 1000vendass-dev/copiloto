# Copiloto

Plataforma pessoal de operação para venda de veículos: CRM, estoque, agenda, tarefas e assistente de IA.

**Stack:** Next.js (App Router) · TypeScript · Tailwind CSS · Supabase (Postgres, Auth, Storage, RLS) · Vercel.

## Rodar localmente

```bash
cp .env.example .env.local   # preencha com as chaves do Supabase
npm install
npm run dev
```

## Scripts

| comando | o que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript sem emitir |
| `npm run build` | build de produção |

Na Vercel o build executa `vercel-build` = lint + typecheck + build (falha se qualquer etapa falhar).

## Banco

Migrations em `supabase/migrations/`. O Supabase é a fonte de verdade — nenhum dado de negócio vive no navegador.
