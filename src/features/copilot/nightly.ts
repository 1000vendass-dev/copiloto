import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STAGE_VALUES, stageLabel } from "@/features/crm/constants";
import { addDays, labelDay, todaySP } from "@/lib/dates";
import { pushToUser } from "@/lib/push";
import { fillLeadName } from "@/lib/whatsapp/ingest";
import { CLASSES, classify, type Classe, type Intencao } from "./classify";
import type { AiConfig } from "./config";
import { loadEngagement, type Engagement } from "./engagement";
import { callJson, emptyUsage, type Usage } from "./llm";
import { buildSystem } from "./persona";
import { storeFacts } from "./profile";
import { computeQuality, type Quality } from "./quality";

/**
 * Rotina da noite: por cliente com novidade, a IA lê só o que é novo (não relê o histórico: parte do resumo
 * vivo), atualiza a memória do cliente, cria/atualiza a tarefa do próximo passo e guarda o resumo do dia.
 * No fim, o relatório do dia chega no chat (na voz da personalidade) e como notificação.
 * SQL calcula os números; a IA interpreta e escreve. Nunca envia mensagem nem muda etapa.
 */

type Admin = SupabaseClient;
export type NightlyCtx = { admin: Admin; userId: string; teamId: string; userName: string; cfg: AiConfig; autonomy: number; runId: string };
export type NightlyStats = {
  leadsDue: number; processed: number; skipped: number; errors: number;
  tasksCreated: number; tasksUpdated: number; memoriesAdded: number; memoriesChanged: number; namesFilled: number;
  tokensIn: number; tokensOut: number; calls: number; seconds: number; partial: boolean; reportSent: boolean;
  /** Classificação de TODOS os leads abertos com conversa: quantos em cada classe, quantas temperaturas mudaram, cadastro preenchido. */
  classes: Record<Classe, number>; classChanges: number; tempChanges: number; cadastroFilled: number;
};

/** Teto por rodada (cabe na assinatura). NIGHTLY_MAX_LEADS permite limitar para testes. */
const MAX_LEADS = Number(process.env.NIGHTLY_MAX_LEADS) || 40;
const MAX_MS = 25 * 60 * 1000;
const MAX_MSGS = 60;
/** A IA NUNCA lê mensagem com mais de 1 dia: o histórico está no resumo vivo, atualizado toda noite. */
const READ_WINDOW_MS = 24 * 3600 * 1000;

const leadAnalysis = z.object({
  resumo_dia: z.string().min(1).max(700),
  resumo_vivo: z.string().min(1).max(1000),
  nome_cliente: z.string().max(80).nullable(),
  fatos: z.array(z.object({ op: z.enum(["add", "update", "archive"]), id: z.string().nullable(), texto: z.string().min(1).max(260) })).max(6),
  travas: z.array(z.string().max(180)).max(4),
  sinais: z.array(z.string().max(180)).max(4),
  objecoes: z.array(z.string().max(180)).max(4),
  dados_faltando: z.array(z.string().max(90)).max(5),
  proxima_acao: z.object({
    titulo: z.string().min(3).max(110), descricao: z.string().max(320),
    em_dias: z.number().int().min(1).max(60), prioridade: z.enum(["baixa", "media", "alta"]),
  }).nullable(),
  sugestao_etapa: z.object({ etapa: z.enum(STAGE_VALUES), motivo: z.string().max(180) }).nullable(),
  /** Intenção de compra lida na conversa (a classe final sai do código, com o engajamento medido). */
  intencao: z.enum(["forte", "media", "fraca", "nenhuma"]),
  motivo_classificacao: z.string().min(1).max(220),
  /** Só se o lead não serve por um motivo objetivo (orçamento abaixo do estoque, sem condição nenhuma). Senão null. */
  ruido_motivo: z.string().max(160).nullable(),
  /** Só o que o CLIENTE disse na conversa. null = ele não disse. */
  cadastro: z.object({
    interesse: z.string().max(160).nullable(),
    orcamento_max: z.number().min(0).max(5_000_000).nullable(),
    pagamento: z.string().max(120).nullable(),
    troca: z.string().max(160).nullable(),
    prazo: z.string().max(80).nullable(),
    origem: z.string().max(60).nullable(),
  }),
});
type LeadAnalysis = z.infer<typeof leadAnalysis>;

const reportSchema = z.object({ mensagem: z.string().min(20).max(2600) });

type LeadRow = Record<string, unknown> & { id: string; name: string; stage: string };
type Done = { id: string; name: string; stage: string; resumo_dia: string; proxima: string | null; travas: string[]; sinais: string[] };

const fmtWhen = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export async function leadMessages(admin: Admin, leadId: string, since: string | null) {
  const { data: contacts } = await admin.from("whatsapp_contacts").select("id").eq("lead_id", leadId);
  const cIds = (contacts ?? []).map((c) => c.id as string);
  if (!cIds.length) return [];
  const { data: convs } = await admin.from("whatsapp_conversations").select("id").in("contact_id", cIds);
  const convIds = (convs ?? []).map((c) => c.id as string);
  if (!convIds.length) return [];
  let q = admin.from("whatsapp_messages").select("direction,type,body,transcript,sent_at").in("conversation_id", convIds)
    .order("sent_at", { ascending: false }).limit(MAX_MSGS);
  const floor = new Date(Date.now() - READ_WINDOW_MS).toISOString();
  q = q.gt("sent_at", since && since > floor ? since : floor);
  const { data } = await q;
  return (data ?? []).reverse();
}

export function messageText(m: { type: string; body: string | null; transcript: string | null }): string {
  if (m.type === "audio") return m.transcript ? `[áudio] ${m.transcript}` : "[áudio sem transcrição]";
  if (m.type === "imagem") return m.body && !/^\[[^\]]+\]$/.test(m.body) ? `[foto] ${m.body}` : "[enviou uma foto]";
  if (m.type === "video") return "[enviou um vídeo]";
  if (m.type === "documento") return "[enviou um documento]";
  if (m.type === "localizacao") return "[enviou a localização]";
  return (m.body ?? "").trim();
}

/** "há 2 dias", "há 5 horas": só o tempo, sem ler conteúdo antigo. */
function ago(iso: string | null): string {
  if (!iso) return "nenhuma nos últimos 30 dias";
  const h = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 3600000));
  const d = Math.floor(h / 24);
  return h < 24 ? `há ${h} hora${h === 1 ? "" : "s"}` : `há ${d} dia${d === 1 ? "" : "s"}`;
}

function leadPrompt(lead: LeadRow, sellerName: string, summary: string | null, facts: { id: string; content: string }[],
  tasks: { title: string; due_at: string | null }[], msgs: Awaited<ReturnType<typeof leadMessages>>, e: Engagement | undefined): string {
  const convo = msgs.map((m) => `${fmtWhen.format(new Date(m.sent_at as string))} ${m.direction === "entrada" ? "CLIENTE" : "VENDEDOR"}: ${messageText(m as never).slice(0, 700)}`).join("\n");
  return [
    `Hoje: ${labelDay(todaySP())} (${todaySP()}). Vendedor: ${sellerName}.`,
    `LEAD: ${lead.name} · etapa ${stageLabel(lead.stage)} · temperatura ${val(lead.temperature)}`,
    `CADASTRO: interesse ${val(lead.interest)}; orçamento ${val(lead.budget_max)}; pagamento ${val(lead.payment_method)}; troca ${val(lead.trade_in)}; prazo ${val(lead.purchase_timeframe)}; origem ${val(lead.source)}; próxima ação ${val(lead.next_action)}`,
    `RESUMO ANTERIOR (o que você já sabia): ${summary ?? "nenhum: esta é a primeira análise deste cliente"}`,
    `FATOS GUARDADOS (id → texto): ${facts.length ? facts.map((f) => `${f.id} → ${f.content}`).join(" | ") : "nenhum"}`,
    `TAREFAS ABERTAS: ${tasks.length ? tasks.map((t) => `${t.title}${t.due_at ? ` (${fmtWhen.format(new Date(t.due_at))})` : ""}`).join("; ") : "nenhuma"}`,
    `ATENÇÃO: os áudios são transcritos automaticamente e podem errar nomes e palavras (o vendedor se chama ${sellerName}; a loja é a Vila Real Veículos). Não conclua nada a partir de diferenças de grafia ou de nome.`,
    `SITUAÇÃO DA CONVERSA (medida pelo sistema; é tudo o que você sabe do passado além do resumo): última resposta do cliente ${ago(e?.ultimaDele ?? null)}; mensagens do vendedor sem resposta desde então: ${e?.semResposta ?? 0}; respostas do cliente nos últimos 3 dias: ${e?.respostas3d ?? 0}.`,
    `CONVERSA DAS ÚLTIMAS 24H (cliente = ele; vendedor = ${sellerName}). Você só vê o último dia; o que veio antes está no RESUMO ANTERIOR. Não invente o que aconteceu antes dele:
${convo}`,
    [
      "COMO RESPONDER:",
      "- resumo_dia: o que aconteceu hoje, em 2 a 4 frases.",
      "- resumo_vivo: o estado ATUAL da negociação em até 6 frases, substituindo o resumo anterior (o que ele quer, o que travou, o que falta, o que ficou combinado).",
      "- nome_cliente: só se o CLIENTE disse o próprio nome na conversa; senão null.",
      "- fatos: só fatos DURÁVEIS e úteis para vender (rotina, restrição, família, carro de troca, preferência, prazo). Use update/archive com o id para corrigir os guardados; nunca repita um fato já guardado. Lista vazia é normal.",
      "- travas, sinais, objeções: curtos e concretos.",
      "- dados_faltando: o que falta no cadastro para fechar (orçamento, pagamento, troca, prazo, telefone...).",
      "- proxima_acao: UM próximo passo concreto para o vendedor, ou null se não há o que fazer. em_dias conta a partir de hoje (mínimo 1).",
      "- sugestao_etapa: só se a conversa justificar; null se a atual está certa. A etapa e a temperatura do cadastro são palpites antigos: julgue pelo que o cliente FEZ e DISSE.",
      "- intencao (leia a conversa com espírito crítico):",
      "    forte = quer comprar E tem condição viável (orçamento compatível com o estoque, meio de pagamento ou troca definidos) E deu passo concreto (pediu preço, foto, localização, marcou ou perguntou de visita).",
      "    media = tem interesse e deu alguma informação concreta, mas há obstáculo real (restrição de crédito, sem entrada, parcela muito abaixo do que o mercado oferece, só comparando preço) ou ainda não deu passo concreto.",
      "    fraca = curiosidade, respostas curtas ('ok', 'boa tarde'), só perguntou de um anúncio, sem dado concreto.",
      "    nenhuma = disse que não quer, já comprou em outro lugar ou adiou para depois de muito tempo.",
      "- motivo_classificacao: uma frase com a EVIDÊNCIA (o que ele disse ou fez) que sustenta a intenção. Não use adjetivo sem evidência.",
      "- ruido_motivo: preencha SÓ se há motivo objetivo de o lead não servir (ex.: orçamento muito abaixo do menor carro do estoque, não quer financiar e não tem como pagar à vista). Senão null.",
      "- cadastro: copie SÓ o que o CLIENTE disse na conversa (interesse, orçamento em reais, forma de pagamento, carro de troca, prazo, onde viu o carro). Se ele não disse, null. Nunca estime, nunca deduza do que o vendedor falou, nunca arredonde por conta própria.",
      "Seja crítica e realista: se o cliente só deu respostas curtas, diga isso; se o vendedor mandou áudio sem pergunta de fechamento ou ficou sem retorno, registre em travas. Nunca invente dado nem torça a conversa para parecer promissora.",
    ].join("\n"),
  ].join("\n\n");
}

/** Hora do compromisso de amanhã em diante: 09:00 + 10 min por tarefa, para não empilhar tudo no mesmo horário. */
function dueAt(emDias: number, slot: number): string {
  const day = addDays(todaySP(), emDias);
  const minutes = Math.min(540 + slot * 10, 17 * 60 + 30);
  const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
  const mm = String(minutes % 60).padStart(2, "0");
  return `${day}T${hh}:${mm}:00-03:00`;
}

async function applyAnalysis(ctx: NightlyCtx, lead: LeadRow, a: LeadAnalysis, factIds: Set<string>, slot: number, stats: NightlyStats): Promise<string | null> {
  const { admin, teamId, userId } = ctx;
  const nowIso = new Date().toISOString();
  const day = todaySP();

  // memória do cliente (camada 2): adiciona, corrige ou arquiva; só mexe em ids que mostramos à IA
  for (const f of a.fatos) {
    if (f.op === "add") {
      const { error } = await admin.from("ai_memory").insert({
        team_id: teamId, owner_id: userId, scope: "cliente", lead_id: lead.id, content: f.texto, importance: 3,
        status: "ativa", source: "rotina", confidence: 3, evidence: `Rotina da noite ${day}`,
      });
      if (!error) stats.memoriesAdded++;
    } else if (f.id && factIds.has(f.id)) {
      const patch = f.op === "archive" ? { status: "arquivada" } : { content: f.texto, evidence: `Corrigido na rotina da noite ${day}` };
      const { error } = await admin.from("ai_memory").update({ ...patch, updated_at: nowIso }).eq("id", f.id).eq("lead_id", lead.id);
      if (!error) stats.memoriesChanged++;
    }
  }

  // nome real do cliente, se ele mesmo disse (nunca troca um nome que o vendedor escreveu)
  if (a.nome_cliente && (await fillLeadName(admin, lead.id, a.nome_cliente))) stats.namesFilled++;

  // próximo passo vira tarefa (uma tarefa da IA por lead; a análise mais nova a substitui).
  // Cada tarefa tem UM dono: se um agente da equipe (Follow-up, SDR, Pós-venda) já cuida deste lead, a rotina
  // da noite não cria nem mexe em tarefa; a sugestão dela fica no resumo do dia para o agente usar.
  let nextTitle: string | null = null;
  const { data: doAgente } = await admin.from("tasks").select("id").eq("lead_id", lead.id).eq("status", "pendente")
    .in("source", ["follow_up", "sdr", "pos_venda"]).limit(1);
  if (a.proxima_acao && doAgente?.length) nextTitle = a.proxima_acao.titulo;
  else if (a.proxima_acao) {
    const p = a.proxima_acao;
    nextTitle = p.titulo;
    const due = dueAt(p.em_dias, slot);
    const { data: mine } = await admin.from("tasks").select("id").eq("lead_id", lead.id).eq("source", "ia").eq("status", "pendente").limit(1);
    if (mine?.length) {
      await admin.from("tasks").update({ title: p.titulo, description: p.descricao, due_at: due, priority: p.prioridade, updated_at: nowIso }).eq("id", mine[0].id);
      stats.tasksUpdated++;
    } else {
      // se o vendedor já planejou algo para perto dessa data, não duplica
      const limit = new Date(new Date(due).getTime() + 36 * 3600000).toISOString();
      const { data: yours } = await admin.from("tasks").select("id").eq("lead_id", lead.id).eq("status", "pendente").lte("due_at", limit).limit(1);
      if (!yours?.length) {
        const { error } = await admin.from("tasks").insert({
          team_id: teamId, owner_id: userId, lead_id: lead.id, title: p.titulo, description: p.descricao, due_at: due, priority: p.prioridade, status: "pendente", source: "ia",
        });
        if (!error) stats.tasksCreated++;
      }
    }
  }

  await admin.from("lead_daily_summaries").upsert({
    team_id: teamId, lead_id: lead.id, day, summary: a.resumo_dia, blockers: a.travas, signals: a.sinais, next_action: a.proxima_acao?.titulo ?? null,
  }, { onConflict: "lead_id,day" });

  // cadastro: preenche o que está VAZIO com o que o cliente disse; o que já tem valor diferente não é sobrescrito
  // (o vendedor pode ter razão): vira divergência, mostrada no Resumo da IA para ele decidir.
  const fill: Record<string, unknown> = {};
  const filled: string[] = [];
  const diverg: { campo: string; cadastro: string; conversa: string }[] = [];
  const field = (campo: string, col: string, novo: string | number | null) => {
    if (novo === null || novo === "") return;
    const atual = lead[col];
    if (atual === null || atual === undefined || atual === "") { fill[col] = novo; filled.push(`${campo}: ${novo}`); return; }
    const same = typeof novo === "number"
      ? Math.abs(Number(atual) - novo) <= Math.max(1000, Number(atual) * 0.05)
      : (() => { const x = String(atual).trim().toLowerCase(); const y = String(novo).trim().toLowerCase(); return x.includes(y) || y.includes(x); })();
    if (!same) diverg.push({ campo, cadastro: String(atual), conversa: String(novo) });
  };
  const c = a.cadastro;
  field("Interesse", "interest", c.interesse);
  field("Orçamento", "budget_max", c.orcamento_max);
  field("Pagamento", "payment_method", c.pagamento);
  field("Troca", "trade_in", c.troca);
  field("Prazo", "purchase_timeframe", c.prazo);
  field("Origem", "source", c.origem);
  if (Object.keys(fill).length) {
    const { error } = await admin.from("leads").update(fill).eq("id", lead.id);
    if (!error) stats.cadastroFilled += filled.length;
  }

  await admin.from("leads").update({
    ai_summary: a.resumo_vivo, ai_summary_at: nowIso,
    ai_insights: {
      ...((lead.ai_insights as Record<string, unknown> | null) ?? {}),
      travas: a.travas, sinais: a.sinais, objecoes: a.objecoes, dados_faltando: a.dados_faltando,
      sugestao_etapa: a.sugestao_etapa, intencao: a.intencao, motivo_classificacao: a.motivo_classificacao,
      ruido_motivo: a.ruido_motivo, divergencias: diverg, atualizado_em: nowIso,
    },
  }).eq("id", lead.id);

  // aparece na linha do tempo do card
  await admin.from("activities").insert({
    team_id: teamId, owner_id: userId, lead_id: lead.id, type: "ia", title: "Análise da IA",
    description: filled.length ? `${a.resumo_dia}\nCadastro preenchido pela IA: ${filled.join("; ")}` : a.resumo_dia, occurred_at: nowIso,
  });
  return nextTitle;
}

async function dueLeads(admin: Admin, teamId: string): Promise<LeadRow[]> {
  const { data } = await admin.from("leads")
    .select("id,name,phone,stage,temperature,interest,budget_max,payment_method,trade_in,purchase_timeframe,source,next_action,last_contact_at,ai_summary,ai_summary_at,ai_insights")
    .eq("team_id", teamId).not("last_contact_at", "is", null).neq("stage", "perdido")
    .order("last_contact_at", { ascending: false }).limit(300);
  const due = ((data ?? []) as LeadRow[]).filter((l) => !l.ai_summary_at || (l.last_contact_at as string) > (l.ai_summary_at as string));
  if (!due.length) return [];
  const { data: contacts } = await admin.from("whatsapp_contacts").select("lead_id").eq("categoria", "cliente").in("lead_id", due.map((l) => l.id));
  const real = new Set((contacts ?? []).map((c) => c.lead_id as string));
  return due.filter((l) => real.has(l.id)); // só quem tem conversa com cliente de verdade (loja, parceiro e spam ficam de fora)
}

type Moved = { name: string; classe: Classe; motivo: string; tempAntes: string | null; tempDepois: string; mudouClasse: boolean; mudouTemp: boolean };
type Reclass = { moves: Moved[]; byClass: Record<Classe, string[]> };

/**
 * Classifica TODOS os leads abertos com conversa de cliente (não só os que tiveram novidade): a regra mede o
 * engajamento real e por isso um lead "quente" que parou de responder cai para Reativar, e quem nunca respondeu
 * vira Ruído. Atualiza o card (ai_insights.classe) e a temperatura do cadastro, e deixa registro na timeline
 * quando algo muda, com a temperatura anterior guardada para desfazer.
 */
async function reclassifyAll(ctx: NightlyCtx, stats: NightlyStats): Promise<Reclass> {
  const { admin, teamId, userId } = ctx;
  const out: Reclass = { moves: [], byClass: { comprador_real: [], potencial: [], reativar: [], ruido: [] } };
  const { data } = await admin.from("leads").select("id,name,stage,temperature,ai_insights")
    .eq("team_id", teamId).not("stage", "in", "(perdido,venda)").limit(500);
  const leads = (data ?? []) as { id: string; name: string; stage: string; temperature: string | null; ai_insights: Record<string, unknown> | null }[];
  if (!leads.length) return out;

  const real = new Set<string>();
  for (let i = 0; i < leads.length; i += 80) {
    const { data: contacts } = await admin.from("whatsapp_contacts").select("lead_id").eq("categoria", "cliente").in("lead_id", leads.slice(i, i + 80).map((l) => l.id));
    for (const c of contacts ?? []) real.add(c.lead_id as string);
  }
  const mine = leads.filter((l) => real.has(l.id));
  const eng = await loadEngagement(admin, mine.map((l) => l.id));
  const nowIso = new Date().toISOString();

  for (const lead of mine) {
    const ins = (lead.ai_insights ?? {}) as Record<string, unknown>;
    const e = eng.get(lead.id)!;
    const { classe, motivo } = classify({
      stage: lead.stage, temperature: lead.temperature, intencao: (ins.intencao as Intencao | undefined) ?? null,
      ruidoMotivo: (ins.ruido_motivo as string | null | undefined) ?? null, ...e,
    });
    stats.classes[classe]++;
    out.byClass[classe].push(lead.name);
    // se o vendedor mexeu nos botões de temperatura nos últimos 3 dias, a IA respeita e não desfaz
    const manual = typeof ins.temp_manual_at === "string" && Date.now() - Date.parse(ins.temp_manual_at) < 3 * 86400000;
    const novaTemp = manual ? (lead.temperature ?? CLASSES[classe].temperature) : CLASSES[classe].temperature;
    const mudouClasse = ins.classe !== classe;
    const mudouTemp = lead.temperature !== novaTemp;
    if (!mudouClasse && !mudouTemp && ins.classe_motivo === motivo) continue;

    const { error } = await admin.from("leads").update({
      temperature: novaTemp,
      ai_insights: { ...ins, classe, classe_motivo: motivo, classe_em: nowIso, ...(mudouTemp ? { temperatura_anterior: lead.temperature } : {}) },
    }).eq("id", lead.id);
    if (error) { stats.errors++; continue; }
    if (mudouClasse) stats.classChanges++;
    if (mudouTemp) stats.tempChanges++;
    if (mudouTemp) {
      await admin.from("activities").insert({
        team_id: teamId, owner_id: userId, lead_id: lead.id, type: "ia", occurred_at: nowIso,
        title: `IA ajustou a temperatura: ${lead.temperature ?? "sem"} → ${novaTemp}`, description: motivo,
      });
    }
    if (mudouClasse || mudouTemp) {
      out.moves.push({ name: lead.name, classe, motivo, tempAntes: lead.temperature, tempDepois: novaTemp, mudouClasse, mudouTemp });
    }
  }
  return out;
}

function reportPrompt(done: Done[], stats: NightlyStats, quality: Quality, rc: Reclass): string {
  const leads = done.length
    ? done.slice(0, 25).map((d) => `- ${d.name} (${stageLabel(d.stage)}): ${d.resumo_dia} → próximo passo: ${d.proxima ?? "nenhum"}${d.travas.length ? ` | trava: ${d.travas[0]}` : ""}`).join("\n")
    : "nenhum cliente com novidade hoje";
  const list = (c: Classe) => (rc.byClass[c].length ? rc.byClass[c].slice(0, 12).join(", ") : "ninguém");
  const classes = [
    `QUENTES = COMPRADORES REAIS (${rc.byClass.comprador_real.length}): ${list("comprador_real")}`,
    `MORNOS = POTENCIAIS (${rc.byClass.potencial.length}): ${list("potencial")}`,
    `MORNOS PARA REATIVAR (${rc.byClass.reativar.length}): ${list("reativar")}`,
    `FRIOS = RUÍDO (${rc.byClass.ruido.length}): ${list("ruido")}`,
  ].join("\n");
  const moves = rc.moves.length
    ? rc.moves.slice(0, 15).map((m) => `- ${m.name}: ${CLASSES[m.classe].label}${m.mudouTemp ? ` (temperatura ${m.tempAntes ?? "sem"} → ${m.tempDepois})` : ""}: ${m.motivo}`).join("\n")
    : "nenhuma mudança hoje";
  const missing = quality.items.length
    ? quality.items.map((i) => `- ${i.label}: ${i.count}${i.sample.length ? ` (${i.sample.join(", ")})` : ""}`).join("\n")
    : "nada faltando";
  return [
    `Hoje: ${labelDay(todaySP())}.`,
    `NÚMEROS (calculados pelo sistema, são exatos): ${stats.processed} clientes analisados hoje, ${stats.tasksCreated} tarefas criadas e ${stats.tasksUpdated} atualizadas para os próximos dias, ${stats.memoriesAdded} fatos novos guardados, ${stats.cadastroFilled} campos de cadastro preenchidos, ${stats.tempChanges} temperaturas ajustadas. Visitas registradas esta semana: ${quality.visitsThisWeek}.`,
    `TEMPERATURA DOS LEADS (a classificação oficial; a regra do sistema a atualiza pelo comportamento real; quente = comprador real = respondeu nos últimos 3 dias com intenção forte):\n${classes}`,
    `MUDANÇAS DE TEMPERATURA HOJE:\n${moves}`,
    `CLIENTES COM NOVIDADE HOJE:\n${leads}`,
    `DADOS FALTANDO NO SISTEMA:\n${missing}`,
    [
      "Escreva o relatório do dia para o vendedor, na SUA voz (personalidade acima), em no máximo uns 1700 caracteres. Seja crítica e realista: não enfeite o dia e não invente nada.",
      "1. Abra com uma frase honesta sobre o dia, usando os números (diga também o que NÃO andou).",
      "2. **Quentes (compradores reais)**: até 5, cada um numa linha começando com '- ', nome em **negrito** e o que fazer amanhã. Se não houver comprador real, diga isso claramente.",
      "3. **Mornos para reativar**: até 3 leads que estavam quentes no cadastro mas pararam de responder, e uma forma de retomar. Seja direta: no cadastro eles pareciam promissores, na prática estão parados.",
      "4. **Frios (ruído)**: só a quantidade e um nome ou dois, sem gastar tempo com eles.",
      "5. **O que falta no sistema**: até 3 itens, os mais importantes, dizendo como resolver.",
      "6. Feche com UMA crítica construtiva sobre o atendimento de hoje (o que o vendedor deixou de fazer, com evidência dos dados) e UM conselho concreto.",
      "Diga que as tarefas de amanhã já estão criadas. Use apenas ** para negrito e '- ' para listas (sem títulos com #).",
    ].join("\n"),
  ].join("\n\n");
}

export async function runNightly(ctx: NightlyCtx): Promise<NightlyStats> {
  const t0 = Date.now();
  const { admin, teamId, userId, cfg, userName } = ctx;
  const usage: Usage = emptyUsage();
  const stats: NightlyStats = {
    leadsDue: 0, processed: 0, skipped: 0, errors: 0, tasksCreated: 0, tasksUpdated: 0, memoriesAdded: 0, memoriesChanged: 0, namesFilled: 0,
    tokensIn: 0, tokensOut: 0, calls: 0, seconds: 0, partial: false, reportSent: false,
    classes: { comprador_real: 0, potencial: 0, reativar: 0, ruido: 0 }, classChanges: 0, tempChanges: 0, cadastroFilled: 0,
  };

  const facts = await storeFacts(admin, teamId);
  const system = buildSystem(cfg, userName, facts,
    "Você está fazendo a análise noturna de UM cliente do vendedor. Seja específico, curto e honesto: só o que a conversa e o cadastro mostram.");

  const due = await dueLeads(admin, teamId);
  stats.leadsDue = due.length;
  const batch = due.slice(0, MAX_LEADS);
  if (due.length > MAX_LEADS) stats.partial = true;

  const batchEng = await loadEngagement(admin, batch.map((l) => l.id));
  const done: Done[] = [];
  let slot = 0;
  for (const lead of batch) {
    if (Date.now() - t0 > MAX_MS) { stats.partial = true; break; }
    try {
      const msgs = await leadMessages(admin, lead.id, (lead.ai_summary_at as string | null) ?? null);
      if (!msgs.length) {
        await admin.from("leads").update({ ai_summary_at: new Date().toISOString() }).eq("id", lead.id); // nada de novo: não reprocessa
        stats.skipped++;
        continue;
      }
      const [{ data: mem }, { data: tasks }] = await Promise.all([
        admin.from("ai_memory").select("id,content").eq("lead_id", lead.id).eq("scope", "cliente").in("status", ["ativa", "sugerida"]).limit(20),
        admin.from("tasks").select("title,due_at").eq("lead_id", lead.id).eq("status", "pendente").limit(6),
      ]);
      const factList = (mem ?? []) as { id: string; content: string }[];
      const { data: a, usage: u } = await callJson({
        system, tier: "haiku", schema: leadAnalysis,
        prompt: leadPrompt(lead, userName, (lead.ai_summary as string | null) ?? null, factList, (tasks ?? []) as { title: string; due_at: string | null }[], msgs, batchEng.get(lead.id)),
      });
      usage.input += u.input; usage.output += u.output; usage.calls += u.calls;
      const nextTitle = await applyAnalysis(ctx, lead, a, new Set(factList.map((f) => f.id)), slot, stats);
      if (a.proxima_acao?.em_dias === 1) slot++;
      done.push({ id: lead.id, name: lead.name, stage: lead.stage, resumo_dia: a.resumo_dia, proxima: nextTitle, travas: a.travas, sinais: a.sinais });
      stats.processed++;
    } catch (e) {
      stats.errors++;
      console.error("[nightly] lead", lead.id, e instanceof Error ? e.message : e);
      if (e instanceof Error && /limite de uso|sem login|não consegui falar/i.test(e.message)) { stats.partial = true; break; } // motor fora do ar: para
    }
  }

  // classifica TODOS os leads pelo comportamento real e atualiza card e temperatura (sempre, mesmo sem conversa nova)
  let rc: Reclass = { moves: [], byClass: { comprador_real: [], potencial: [], reativar: [], ruido: [] } };
  try { rc = await reclassifyAll(ctx, stats); } catch (e) { console.error("[nightly] classificação", e instanceof Error ? e.message : e); stats.errors++; }

  // relatório do dia (modelo melhor, uma chamada só), com os dados faltando calculados em SQL
  const quality = await computeQuality(admin, teamId);
  if (stats.processed > 0 || stats.classChanges > 0 || quality.items.some((i) => i.severity === "alta")) {
    try {
      const { data, usage: u } = await callJson({
        system: buildSystem(cfg, userName, facts, "Você está escrevendo o relatório do fim do dia para o vendedor."),
        prompt: reportPrompt(done, stats, quality, rc), schema: reportSchema, tier: "sonnet",
      });
      usage.input += u.input; usage.output += u.output; usage.calls += u.calls;
      const top = done.filter((d) => d.proxima).slice(0, 5);
      await admin.from("ai_messages").insert({
        team_id: teamId, user_id: userId, role: "assistant", content: data.mensagem,
        meta: {
          kind: "relatorio", run_id: ctx.runId,
          actions: top.map((d) => ({ tool: "relatorio", ok: true, status: "sucesso", summary: "", lead: { id: d.id, name: d.name, created: false } })),
        },
      });
      await pushToUser(admin, userId, {
        title: `${cfg.identity.emoji} ${cfg.identity.name} · Resumo do dia`,
        body: data.mensagem.replace(/\*\*/g, "").replace(/\s+/g, " ").slice(0, 140),
        url: "/copiloto", tag: "relatorio-dia",
      });
      stats.reportSent = true;
    } catch (e) {
      console.error("[nightly] relatório", e instanceof Error ? e.message : e);
      stats.errors++;
    }
  }

  stats.tokensIn = usage.input; stats.tokensOut = usage.output; stats.calls = usage.calls;
  stats.seconds = Math.round((Date.now() - t0) / 1000);
  return stats;
}
