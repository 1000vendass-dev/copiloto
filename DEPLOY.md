# Deploy

```
git push (main) → GitHub (1000vendass-dev/copiloto) → Vercel (projeto "copiloto", equipe 100vendas) → build → produção
```

Cada push no `main` publica em produção **se** `npm run vercel-build` (lint + typecheck + build) passar.
Se falhar, a produção continua na última versão boa. Outros branches geram *preview*.

## Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Onde | Observação |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | todas | pública |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | todas | pública (protegida por RLS) |
| `ANTHROPIC_API_KEY` | Production | **secreta** — só no servidor; nunca com `NEXT_PUBLIC_` |
| `COPILOTO_MODEL` | opcional | padrão `claude-sonnet-5` |

Depois de mudar variáveis: **Deployments → Redeploy**.

## Supabase Auth

Authentication → URL Configuration:
- Site URL: `https://copiloto-six-eta.vercel.app`
- Redirect URLs: `https://copiloto-six-eta.vercel.app/**`

## Migrations

Aplicar em ordem os arquivos de `supabase/migrations/` (via Supabase CLI `supabase db push` ou SQL Editor).

## Diagnóstico de build sem acesso aos logs

Se o build falhar e os logs não estiverem acessíveis, num branch temporário troque `vercel-build` por
`mkdir -p public && (npm run lint; npm run typecheck) > public/diag.txt 2>&1; next build` e ative
`typescript.ignoreBuildErrors` / `eslint.ignoreDuringBuilds` no `next.config.ts`; leia `/diag.txt` no deploy e **reverta**.

## Domínio próprio

Depois de validar em `*.vercel.app`: Vercel → Settings → Domains → adicionar, e atualizar a Site URL do Supabase.
