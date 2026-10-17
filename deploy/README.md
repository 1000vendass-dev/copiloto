# Copiloto na VPS (Docker) — separado do CRM

Três containers, todos na rede docker própria `copiloto-net` (sem ligação com o CRM):

| Pasta na VPS | Container | O que é |
|---|---|---|
| `/root/copiloto-waha` | `copiloto-waha` | WAHA (WhatsApp, motor NOWEB, armazenamento ligado), porta só em `127.0.0.1:3031` |
| `/root/copiloto-app` | `copiloto-app` | este app (Next.js standalone) |
| `/root/copiloto-claude` | `copiloto-claude` | Claude Code logado na assinatura + ponte HTTP (`server.mjs`) |

Entrada pela internet: o Caddy do CRM tem um bloco `copiloto.1000vendas.com` que repassa para `copiloto-app:3000`
e **bloqueia** `/api/whatsapp/webhook` (o WAHA chama o app por dentro da rede).

## Segredos (nunca no Git)
- `/root/copiloto-app/.env`: `NEXT_PUBLIC_SUPABASE_*`, `WAHA_URL`, `WAHA_API_KEY`, `WAHA_SESSION`, `WAHA_HMAC_SECRET`, `COPILOTO_BRIDGE_URL`, `COPILOTO_BRIDGE_TOKEN`
- `/root/copiloto-app/.secrets.env`: `SUPABASE_SERVICE_ROLE_KEY` (chave secreta do projeto Copiloto; testada antes de salvar)
- `/root/copiloto-waha/.env`: `WAHA_API_KEY`
- `/root/copiloto-claude/.env`: `BRIDGE_TOKEN` (o mesmo valor de `COPILOTO_BRIDGE_TOKEN`)

## Subir / atualizar
```
cd /root/copiloto-app && docker compose build && docker compose up -d
cd /root/copiloto-claude && docker compose build && docker compose up -d
```
Login do Claude Code (uma vez): `docker exec -it copiloto-claude claude` → conta com assinatura.

## Regras do produto
- A IA **nunca** envia WhatsApp: cria rascunho (`whatsapp_drafts`) e o vendedor toca em Enviar.
- Com `COPILOTO_BRIDGE_URL` definido, o chat usa o Claude Code (assinatura) e **não** a API paga.
- Uso pessoal: a assinatura não pode atender outros usuários; para vários usuários, trocar por API.
