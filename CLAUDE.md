# CLAUDE.md — Copiloto

> O "caderno" do projeto. O Claude lê este arquivo toda vez que abre esta pasta.
> Regra de ouro: o que estiver aqui vale mais que suposição.
> Detalhes de infraestrutura: `deploy/README.md`.

## Quem sou eu

- Wanderson, consultor de vendas de carros na Vila Real Veículos (Ponte Preta, Campinas/SP).
- Não sou programador de formação, mas tenho raciocínio e já construí e subi este app na minha VPS. **Não me trate como iniciante:** simples não é óbvio, então não explique o que eu já deduzo.
- O Copiloto é meu **primeiro projeto de data engineering, data science e data analysis**.

## Como trabalhamos (workflow)

1. **Claude propõe → eu aprovo → Claude executa.** Nada roda sem meu OK, principalmente:
   - qualquer coisa na VPS via `ssh vps` que altere estado (restart de container, editar arquivo, rodar script)
   - comandos que alteram dados (`INSERT`, `UPDATE`, `DELETE`, migrations no Supabase)
   - qualquer mexida no **Caddy**, que é compartilhado com o DeskcommCRM
2. **`git push` sou eu que faço:** o login do GitHub é meu. Claude me passa o comando e eu colo no terminal.
3. Quando eu questionar algo ou sugerir mudança: **primeiro avalie se é viável** dentro da estrutura que já existe. Nada de criar workflow desnecessário. Operação limpa e objetiva.
4. Leitura e exploração (ler arquivos, `SELECT`, `git status`, `docker ps`, logs) pode fazer direto e me mostrar.

## Método de aula (teaching mode)

- Claude é meu **professor**, não só executor. Cada passo vem com **o que** e **o porquê**, em português simples e sem enrolação.
- **Teoria + prática juntas:** explica e eu executo logo em seguida no terminal.
- **Inglês aos poucos:** usar os termos técnicos em inglês e aumentar a dose com o tempo. Meta final: conversar com o Claude em inglês técnico.
- Fechar cada aula com **3 a 5 termos novos** (English → português).
- **Revisão toda semana** do que aprendi.
- Duas aulas por dia: **manhã** (alinhar o dia) e **noite** (tratar os dados do dia).

## Arquitetura (como está hoje)

- **Tudo na minha VPS (HostGator).** Vercel desativada. Endereço: `https://copiloto.1000vendas.com`.
- **5 containers Docker** na rede própria `copiloto-net`, separada do CRM:
  1. `copiloto-app`: Next.js (repo `github.com/1000vendass-dev/copiloto`, branch `main`)
  2. `copiloto-waha`: WAHA (WhatsApp), número "Wanderson consultor"
  3. `copiloto-claude`: Claude Code logado na minha assinatura + ponte HTTP com senha
  4. `copiloto-whisper`: transcrição de áudio (Whisper, modelo small, ~1 GB). Skill reutilizável: `transcricao-whisper`
  5. `copiloto-cron`: relógio das rotinas da IA (hora em hora, 06h–00h)
- **Banco:** Supabase, projeto "Copiloto". Já tem provider `waha` e a tabela `whatsapp_drafts` (rascunhos).
- **Ponto em comum com o CRM:** só o Caddy (portas 80/443), com 1 bloco para o Copiloto. ⚠️ Se o `update.sh` do CRM reescrever o Caddyfile, o bloco some. Backup em `/root/copiloto-app/Caddyfile.crm.bak`.
- **Acesso à VPS:** atalho `ssh vps`.
- **Clone local de trabalho:** `Desktop\code\copiloto-git`.

## Regras do WhatsApp e da IA

- Mensagem que chega vira lead (ou se liga ao lead existente pelo telefone) e aparece no card como conversa em balões. As que eu mando pelo celular também entram, sem duplicar.
- **A IA NUNCA envia mensagem sozinha.** Ela só cria **rascunho** no card. Eu reviso e toco em Enviar.
- Ferramentas da IA no chat: `read_whatsapp`, `draft_whatsapp`, `get_lead` (traz a conversa real com horário de Brasília).
- Áudios: eu ouço no card; a IA lê a transcrição (`whatsapp_messages.transcript`). Arquivos no bucket privado `whatsapp-media` (o WAHA apaga os dele em ~3 min).
- **Custo:** ~10 mil tokens por passo, quase tudo do cache. O Claude Code da ponte roda com `--strict-mcp-config` para não carregar os conectores da conta (eram ~52 mil tokens). Não remover.
- O chat consome o limite da minha assinatura. Se acabar, avisa e volta quando renovar.
- **Uso pessoal apenas.** Se entrar outro usuário, o chat volta para API paga.

## Segredos (secrets)

- **Nunca** colocar chave, senha ou token no chat, no Git ou neste arquivo.
- Ficam em: `/root/copiloto-app/.env` e `.secrets.env`, `/root/copiloto-waha/.env`, `/root/copiloto-claude/.env`.
- `APP_URL=https://copiloto.1000vendas.com` é obrigatório no `.env` do app (no Docker o Next enxerga `0.0.0.0:3000`).
- A chave secreta do Supabase é colocada por script com campo oculto, que testa a chave antes de salvar.

## Objetivo dos dados

**Vender, faturar, mapear e melhorar minhas negociações.**

- Mapear como cada negociação anda: onde o cliente esfria, quais objeções aparecem, o que faz ele vir à loja.
- Achar **oportunidades, gatilhos e ações** que viram venda.
- Números de hoje (estimativa): ~30 leads/semana, ~4 visitas/semana, 6 a 14 vendas/mês. **Meta: 25 vendas/mês.**
- Métrica principal: **conversão lead → visita** (meu gargalo é trazer o cliente do WhatsApp até a loja; na loja eu fecho).

## Rotina da manhã (alinhar o dia)

1. **Briefing:** ler os resumos e a lista de ações gerados na noite anterior.
2. **Prioridades do dia:** quem chamar primeiro (lead quente, visita marcada, cliente que esfriou), com o motivo de cada um.
3. **Agenda:** visitas, ligações e vídeo chamadas do dia.
4. **Rascunhos:** a IA prepara os rascunhos de abordagem no card de cada lead. Eu reviso e envio.
5. **Mini-aula (10 min):** um conceito novo ou revisão, ligado ao que vamos usar no dia.

## Rotina da noite (pipeline diário)

1. **Coleta (extract):** conversas do dia.
2. **Tratamento (transform):** limpar e organizar.
3. **Resumo por cliente (load):** compilado salvo no banco.
   - Processar **só o que é do dia ou ainda não foi resumido**. Nunca reprocessar tudo (processamento incremental).
4. **Análise da negociação:** em que ponto cada cliente está, o que avançou, o que travou.
5. **Uma query SQL** nos dados reais, explicada linha por linha.
6. **Lista de ações para amanhã**, que alimenta o briefing da manhã.

## Pendências

- Estoque: importo as tabelas em PDF da Loja 1 e Loja 2. Carro que **sumiu da tabela nova = vendido** e tem que sair do estoque. Verificar se já funciona.
- Lead de teste "Ashley" pode ser apagado (com meu OK).
- DeskcommCRM: o Caddy do Copiloto é o `deskcommcrm-caddy-1`. Antes de desligar o CRM, criar um Caddy próprio (plano em `DEPLOY.md`).

## Diário de bordo (changelog)

- 16–17/10/2026: Copiloto migrado da Vercel para a VPS (Docker + WAHA + ponte Claude Code). Vercel e chaves de API antigas apagadas.
- 18/10/2026: Aula 1 de dados. Coluna `whatsapp_contacts.categoria` (cliente, proprio, loja, parceiro, spam) e 4 contatos marcados. Query "quem está esperando minha resposta".
- 19/10/2026: Agenda e Tarefas com botão Novo compromisso / Nova tarefa (páginas `/agenda/novo` e `/tarefas/nova`), igual Novo cliente.
- 19/10/2026: Os 4 leads que não são cliente viraram Perdido ("Não é cliente: ..."). Card do lead ganhou "Tipo de contato" (Cliente/Loja/Parceiro/Próprio/Spam): fora de Cliente, o lead sai do funil. `DEPLOY.md` reescrito para a VPS, com o plano do Caddy próprio.
- 19/10/2026: Card do lead no formato WhatsApp (conversa em tela cheia; topo com perfil, ligar, WhatsApp e agenda; botão + com notas, tarefas, registrar contato e tags; botão da IA com conversa própria por lead). 6 leads antigos ligados ao WhatsApp; lead criado/editado com telefone (app ou IA) liga sozinho.
- 19/10/2026: Áudio no card: gravar e enviar voz (microfone na caixa de mensagem), ouvir os áudios no balão e transcrição automática só para a IA (container `copiloto-whisper`). 12 áudios antigos guardados e transcritos. Ficha técnica no menu +.
- 19/10/2026: Novo visual do app inteiro: tema segue o celular (claro limpo / escuro com vidro), azul de destaque, fonte Inter, botões em pílula, cards de vidro, menu inferior em pílula flutuante, janelas flutuantes com alça.
- 19/10/2026: Configurações > Aparência: tema (automático/claro/escuro) e 6 cores de destaque, salvos no aparelho (cookie). Meu dia com os 4 números em grade 2x2.
- 19/10/2026: Leads abre no funil, cards na ordem da última conversa (como WhatsApp) com bolinha verde de não lidas; selo no menu Leads. App atualiza sozinho (Supabase Realtime). Notificações no celular (Web Push) ao chegar mensagem de cliente; ativar em Configurações > Notificações.
- 20/10/2026: Copiloto IA Fase 1: aba "Minha IA" (identidade, personalidade, autonomia, rotinas, memória, atividade), rotina da noite (resumo vivo por cliente, memória do cliente, tarefas, relatório no chat + push), relógio `copiloto-cron` de hora em hora das 06h à 00h, botão Veio na loja. Design completo em `docs/COPILOTO-IA.md`.
- 19/10/2026: Lead sem nome: IA e cadastro aceitam só telefone ("Sem nome · telefone"); o nome entra sozinho pelo perfil do WhatsApp (1ª mensagem ou contato do WAHA) ou quando a IA lê o nome na conversa. Chat da IA com botão "Abrir conversa" do lead. Chat do Copiloto sem vão embaixo.
- 20/10/2026: Bug "Atrasado" em lead com tarefa já concluída: a próxima ação do lead agora é recalculada por gatilho no banco (tarefas pendentes + compromissos futuros), em vez de 6 caminhos do app escreverem nela. Testado: concluir antes do horário, reabrir e excluir.
- 19/10/2026: IA mais crítica e realista (nunca inventa; não afirma conversão sem dado). Chat lê só o resumo do cliente + as mensagens de HOJE (economia de token). Rotina da noite classifica TODOS os leads pelo comportamento real (temperatura quente/morno/frio = comprador real/potencial ou reativar/ruído), preenche o cadastro com o que o cliente disse (sem sobrescrever; divergência aparece no Resumo da IA) e registra mudanças na timeline.
- 19/10/2026 (noite): a IA NUNCA lê conteúdo de mensagem com mais de 24h (rotina da noite e chat); o passado vem do resumo vivo, e ela recebe só números do sistema (há quanto tempo o cliente está sem responder, mensagens minhas sem resposta), que podem passar de 1 dia. Temperatura muda só nos botões (a rotina da noite atualiza o mesmo campo, respeita ajuste manual por 3 dias via ai_insights.temp_manual_at e registra na timeline só quando a temperatura muda); o Resumo da IA não mostra mais classificação.
