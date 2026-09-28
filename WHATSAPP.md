# WhatsApp (integração futura)

**Status:** estrutura de banco criada; **nenhuma integração ativa**. Só iniciar depois do núcleo estável.

## Arquitetura alvo

```
WhatsApp (Cloud API oficial da Meta, ou provedor)
   ↓ webhook HTTPS (verificação de assinatura)
/api/whatsapp/webhook  (Next.js, rota de servidor)
   ↓ normalização (texto, mídia, remetente, id externo para idempotência)
Supabase: whatsapp_accounts → whatsapp_contacts → whatsapp_conversations → whatsapp_messages
   ↓ vínculo com CRM (contato ↔ lead/cliente pelo telefone; cria lead novo se não existir)
activities (tipo "whatsapp") na timeline do lead
   ↓
Copiloto: resumo da conversa, sugestão de resposta, próximos passos
```

## Fase 1 — somente leitura / contexto / sugestão

- Receber mensagens e guardá-las; vincular ao lead.
- Copiloto resume e **sugere** respostas; o vendedor copia/envia manualmente.
- **Nada é enviado automaticamente.**

## Fase 2 — automação (futura)

- Envio pelo app com confirmação do vendedor; depois, respostas automáticas em casos restritos.

## Segurança

- O webhook gravará com credencial de servidor própria (variável secreta na Vercel), nunca exposta ao navegador.
- RLS: membros da equipe leem; só admins configuram contas; usuários não inserem mensagens diretamente.
- Idempotência: índice único `(team_id, external_id)` em `whatsapp_messages`.
- Mídias no bucket privado `documents`.
