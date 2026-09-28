# Copiloto

Plataforma pessoal de operação para venda de veículos: CRM, estoque com fotos, agenda, tarefas,
propostas, painel e um assistente de IA que consulta e registra direto no banco.

- **Produção:** https://copiloto-six-eta.vercel.app
- **Stack:** Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Vercel · Claude API

## Como usar no dia a dia

| Tela | Para quê |
|---|---|
| **Meu dia** (`/`) | O que fazer agora, quem chamar hoje, agenda e tarefas do dia |
| **Copiloto** (`/copiloto`) | Pergunte ou relate em linguagem natural ("falei com João, quer Onix até 70 mil") |
| **Leads** (`/leads`) | Lista e funil de negociações; ficha com timeline, contatos, notas, follow-ups |
| **Estoque** (`/estoque`) | Busca em linguagem simples ("SUV automático até 100 mil"), fichas, fotos, importação |
| **Agenda / Tarefas** | Visitas, test-drives, follow-ups |
| **Propostas** | Monta proposta, acompanha status, registra a venda |
| **Painel** | Métricas reais do banco |

No celular: abra o site e use **Mais → Usar como aplicativo** para instalar (PWA).

## Rodar localmente

```bash
cp .env.example .env.local   # preencha as variáveis
npm install
npm run dev                  # http://localhost:3000
```

## Scripts

| comando | o que faz |
|---|---|
| `npm run dev` | servidor de desenvolvimento |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm run build` | build de produção |
| `npm run vercel-build` | lint + typecheck + build (é o que a Vercel roda; qualquer erro bloqueia o deploy) |

## Documentação

- [ARCHITECTURE.md](ARCHITECTURE.md) — como as partes se conectam
- [DATABASE.md](DATABASE.md) — tabelas, relações, RLS, timeline automática
- [AI.md](AI.md) — como o Copiloto opera (ferramentas, confirmação, auditoria)
- [DEPLOY.md](DEPLOY.md) — como publicar e diagnosticar
- [WHATSAPP.md](WHATSAPP.md) — como será a integração futura
