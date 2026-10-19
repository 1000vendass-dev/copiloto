# Deploy

O Copiloto roda na VPS (Docker). A Vercel foi desativada em 17/10/2026.
Infraestrutura (containers, rede, segredos): `deploy/README.md`.

```
PC (repo copiloto-git) → git push → GitHub (cópia oficial)
                       → pacote com os arquivos alterados → VPS /root/copiloto-app/src → docker compose build → no ar
```

A pasta `/root/copiloto-app/src` da VPS **não é um repositório Git**: é uma cópia do código. Por isso o deploy
manda só os arquivos do último commit e o `build` acontece na própria VPS.

## Publicar uma mudança

1. No PC, com o commit feito (`git status` limpo):
   ```
   git diff --name-only HEAD~1 HEAD > mudanca.txt
   git archive -o ../mudanca.tar HEAD -- $(cat mudanca.txt)     # bash; no PowerShell use tar -cf ... -T mudanca.txt
   scp ../mudanca.tar vps:/tmp/mudanca.tar
   ```
   Use caminho relativo no `tar`/`scp`: `C:` é lido como nome de servidor.
2. Na VPS:
   ```
   cd /root/copiloto-app/src && tar -xf /tmp/mudanca.tar && rm /tmp/mudanca.tar
   cd /root/copiloto-app && docker compose build && docker compose up -d
   ```
   Se o `build` falhar, o `up -d` não roda e a versão anterior continua no ar.
3. Conferir: `docker inspect -f '{{.State.Health.Status}}' copiloto-app` → `healthy`, e testar no navegador.
4. `git push` (o push é do Wanderson).

Arquivo **apagado** num commit não some da VPS com esse método: apague à mão em `/root/copiloto-app/src`.
Se a cópia da VPS ficar em dúvida, compare com o repo (md5 de cada arquivo) antes de publicar.

## Variáveis de ambiente

Ficam na VPS, nunca no Git: `/root/copiloto-app/.env` e `.secrets.env` (lista em `deploy/README.md`).
`APP_URL=https://copiloto.1000vendas.com` é obrigatório. Depois de mudar: `docker compose up -d` (recria o container).
As `NEXT_PUBLIC_*` entram no build: mudou uma delas, rode `docker compose build` de novo.

## Supabase Auth

Authentication → URL Configuration: Site URL e Redirect URLs em `https://copiloto.1000vendas.com` (e `/**`).

## Migrations

Arquivos em `supabase/migrations/`, aplicados em ordem (Supabase CLI `supabase db push` ou SQL Editor).
Toda mudança de estrutura passa pela aprovação do Wanderson antes de rodar.

## Caddy próprio (plano, ainda não executado)

Hoje quem publica `copiloto.1000vendas.com` é o Caddy do CRM (`deskcommcrm-caddy-1`, em
`/root/DeskcommCRM/docker-compose.prod.yml`, Caddyfile em `/root/DeskcommCRM/Caddyfile`, portas 80/443).
Desligar o CRM inteiro derruba o Copiloto. Para ficar independente:

1. Criar `/root/copiloto-caddy/` com `docker-compose.yml` (imagem `caddy:2-alpine`, portas 80/443, rede `copiloto-net`,
   volumes próprios `/data` e `/config`) e um Caddyfile só com o bloco `copiloto.1000vendas.com`
   (o mesmo de hoje: `encode gzip`, 403 em `/api/whatsapp/webhook`, `reverse_proxy copiloto-app:3000`).
2. Validar antes de trocar: `docker run --rm -v .../Caddyfile:/etc/caddy/Caddyfile caddy:2-alpine caddy validate --config /etc/caddy/Caddyfile`.
3. Troca (o site fica fora por alguns segundos): parar o Caddy do CRM (`docker compose -f docker-compose.prod.yml stop caddy`
   em `/root/DeskcommCRM`) e subir o novo (`docker compose up -d` em `/root/copiloto-caddy`).
   O certificado é emitido de novo pelo Let's Encrypt na primeira requisição.
4. Conferir `https://copiloto.1000vendas.com` e o WhatsApp (o webhook é interno, pela rede `copiloto-net`).
5. Volta atrás, se der errado: parar o Caddy novo e `start caddy` no CRM. Nada é apagado no caminho.
6. Só depois, e se quiser, parar ou remover o resto do CRM. O `update.sh` do CRM não pode religar o Caddy dele
   enquanto o novo estiver nas portas 80/443.

Se o CRM continuar ligado (os dois sistemas no ar), o Caddy do CRM precisa continuar sendo o único nas 80/443;
nesse caso não há o que fazer além de manter o backup `/root/copiloto-app/Caddyfile.crm.bak` em dia.
