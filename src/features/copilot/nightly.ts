import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { STAGE_VALUES, stageLabel } from "@/features/crm/constants";
import { addDays, labelDay, todaySP } from "@/lib/dates";
import { pushToUser } from "@/lib/push";
import { fillLeadName } from "@/lib/whatsapp/ingest";
import type { AiConfig } from "./config";
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
};

/** Teto por rodada (cabe na assinatura). NIGHTLY_MAX_LEADS permite limitar para testes. */
const MAX_LEADS = Number(process.env.NIGHTLY_MAX_LEADS) || 40;
const MAX_MS = 25 * 60 * 1000;
const MAX_MSGS = 60;

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
  temperatura_sugerida: z.enum(["frio", "morno", "quente"]).nullable(),
});
type LeadAnalysis = z.infer<typeof leadAnalysis>;

const reportSchema = z.object({ mensagem: z.string().min(20).max(2600) });

type LeadRow = Record<string, unknown> & { id: string; name: string; stage: string };
type Done = { id: string; name: string; stage: string; resumo_dia: string; proxima: string | null; travas: string[]; sinais: string[] };

const fmtWhen = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
const val = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

async function leadMessages(admin: Admin, leadId: string, since: string | null) {
  const { data: contacts } = await admin.from("whatsapp_contacts").select("id").eq("lead_id", leadId);
  const cIds = (contacts ?? []).map((c) => c.id as string);
  if (!cIds.length) return [];
  const { data: convs } = await admin.from("whatsapp_conversations").select("id").in("contact_id", cIds);
  const convIds = (convs ?? []).map((c) => c.id as string);
  if (!convIds.length) return [];
  let q = admin.from("whatsapp_messages").select("direction,type,body,transcript,sent_at").in("conversation_id", convIds)
    .order("sent_at", { ascending: false }).limit(MAX_MSGS);
  if (since) q = q.gt("sent_at", since);
  const { data } = await q;
  return (data ?? []).reverse();
}

function messageText(m: { type: string; body: string | null; transcript: string | null }): string {
  if (m.type === "audio") return m.transcript ? `[áudio] ${m.transcript}` : "[áudio sem transcrição]";
  if (m.type === "imagem") return m.body && !/^\[[^\]]+\]$/.test(m.body) ? `[foto] ${m.body}` : "[enviou uma foto]";
  if (m.type === "video") return "[enviou um vídeo]";
  if (m.type === "documento") return "[enviou um documento]";
  if (m.type === "localizacao") return "[enviou a localização]";
  return (m.body ?? "").trim();
}

function leadPrompt(lead: LeadRow, sellerName: string, summary: string | null, facts: { id: string; content: string }[],
  tasks: { title: string; due_at: string | null }[], msgs: Awaited<ReturnType<typeof leadMessages>>): string {
  const convo = msgs.map((m) => `${fmtWhen.format(new Date(m.sent_at as string))} ${m.direction === "entrada" ? "CLIENTE" : "VENDEDOR"}: ${messageText(m as never).slice(0, 700)}`).join("\n");
  return [
    `Hoje: ${labelDay(todaySP())} (${todaySP()}). Vendedor: ${sellerName}.`,
    `LEAD: ${lead.name} · etapa ${stageLabel(lead.stage)} · temperatura ${val(lead.temperature)}`,
    `CADASTRO: interesse ${val(lead.interest)}; orçamento ${val(lead.budget_max)}; pagamento ${val(lead.payment_method)}; troca ${val(lead.trade_in)}; prazo ${val(lead.purchase_timeframe)}; origem ${val(lead.source)}; próxima ação ${val(lead.next_action)}`,
    `RESUMO ANTERIOR (o que você já sabia): ${summary ?? "nenhum: esta é a primeira análise deste cliente"}`,
    `FATOS GUARDADOS (id → texto): ${facts.length ? facts.map((f) => `${f.id} → ${f.content}`).join(" | ") : "nenhum"}`,
    `TAREFAS ABERTAS: ${tasks.length ? tasks.map((t) => `${t.title}${t.due_at ? ` (${fmtWhen.format(new Date(t.due_at))})` : ""}`).join("; ") : "nenhuma"}`,
    `CONVERSA NOVA (cliente = ele; vendedor = ${sellerName}):\n${convo}`,
    [
      "COMO RESPONDER:",
      "- resumo_dia: o que aconteceu hoje, em 2 a 4 frases.",
      "- resumo_vivo: o estado ATUAL da negociação em até 6 frases, substituindo o resumo anterior (o que ele quer, o que travou, o que falta, o que ficou combinado).",
      "- nome_cliente: só se o CLIENTE disse o próprio nome na conversa; senão null.",
      "- fatos: só fatos DURÁVEIS e úteis para vender (rotina, restrição, família, carro de troca, preferência, prazo). Use update/archive com o id para corrigir os guardados; nunca repita um fato já guardado. Lista vazia é normal.",
      "- travas, sinais, objeções: curtos e concretos.",
      "- dados_faltando: o que falta no cadastro para fechar (orçamento, pagamento, troca, prazo, telefone...).",
      "- proxima_acao: UM próximo passo concreto para o vendedor, ou null se não há o que fazer. em_dias conta a partir de hoje (mínimo 1).",
      "- sugestao_etapa e temperatura_sugerida: só se a conversa justificar; null se a atual está certa.",
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

  // próximo passo vira tarefa (uma tarefa da IA por lead; a análise mais nova a substitui)
  let nextTitle: string | null = null;
  if (a.proxima_acao) {
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

  await admin.from("leads").update({
    ai_summary: a.resumo_vivo, ai_summary_at: nowIso,
    ai_insights: {
      travas: a.travas, sinais: a.sinais, objecoes: a.objecoes, dados_faltando: a.dados_faltando,
      sugestao_etapa: a.sugestao_etapa, temperatura_sugerida: a.temperatura_sugerida, atualizado_em: nowIso,
    },
  }).eq("id", lead.id);

  // aparece na linha do tempo do card
  await admin.from("activities").insert({
    team_id: teamId, owner_id: userId, lead_id: lead.id, type: "ia", title: "Análise da IA", description: a.resumo_dia, occurred_at: nowIso,
  });
  return nextTitle;
}

async function dueLeads(admin: Admin, teamId: string): Promise<LeadRow[]> {
  const { data } = await admin.from("leads")
    .select("id,name,phone,stage,temperature,interest,budget_max,payment_method,trade_in,purchase_timeframe,source,next_action,last_contact_at,ai_summary,ai_summary_at")
    .eq("team_id", teamId).not("last_contact_at", "is", null).neq("stage", "perdido")
    .order("last_contact_at", { ascending: false }).limit(300);
  const due = ((data ?? []) as LeadRow[]).filter((l) => !l.ai_summary_at || (l.last_contact_at as string) > (l.ai_summary_at as string));
  if (!due.length) return [];
  const { data: contacts } = await admin.from("whatsapp_contacts").select("lead_id").eq("categoria", "cliente").in("lead_id", due.map((l) => l.id));
  const real = new Set((contacts ?? []).map((c) => c.lead_id as string));
  return due.filter((l) => real.has(l.id)); // só quem tem conversa com cliente de verdade (loja, parceiro e spam ficam de fora)
}

function reportPrompt(done: Done[], stats: NightlyStats, quality: Quality): string {
  const leads = done.length
    ? done.slice(0, 25).map((d) => `- ${d.name} (${stageLabel(d.stage)}): ${d.resumo_dia} → próximo passo: ${d.proxima ?? "nenhum"}${d.travas.length ? ` | trava: ${d.travas[0]}` : ""}`).join("\n")
    : "nenhum cliente com novidade hoje";
  const missing = quality.items.length
    ? quality.items.map((i) => `- ${i.label}: ${i.count}${i.sample.length ? ` (${i.sample.join(", ")})` : ""}`).join("\n")
    : "nada faltando";
  return [
    `Hoje: ${labelDay(todaySP())}.`,
    `NÚMEROS (calculados pelo sistema, são exatos): ${stats.processed} clientes analisados, ${stats.tasksCreated} tarefas criadas e ${stats.tasksUpdated} atualizadas para os próximos dias, ${stats.memoriesAdded} fatos novos guardados. Visitas registradas esta semana: ${quality.visitsThisWeek}.`,
    `CLIENTES COM NOVIDADE:\n${leads}`,
    `DADOS FALTANDO NO SISTEMA:\n${missing}`,
    [
      "Escreva o relatório do dia para o vendedor, na SUA voz (personalidade acima), em no máximo uns 1400 caracteres:",
      "1. Abra com uma frase sobre o dia (use os números; não invente nenhum).",
      "2. **Destaques**: até 5 clientes que merecem atenção amanhã, cada um numa linha começando com '- ', com o nome em **negrito** e o que fazer.",
      "3. **O que falta no sistema**: até 3 itens, os mais importantes, dizendo como resolver.",
      "4. Feche com UM conselho de venda baseado no que apareceu nas conversas de hoje.",
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
  };

  const facts = await storeFacts(admin, teamId);
  const system = buildSystem(cfg, userName, facts,
    "Você está fazendo a análise noturna de UM cliente do vendedor. Seja específico, curto e honesto: só o que a conversa e o cadastro mostram.");

  const due = await dueLeads(admin, teamId);
  stats.leadsDue = due.length;
  const batch = due.slice(0, MAX_LEADS);
  if (due.length > MAX_LEADS) stats.partial = true;

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
        prompt: leadPrompt(lead, userName, (lead.ai_summary as string | null) ?? null, factList, (tasks ?? []) as { title: string; due_at: string | null }[], msgs),
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

  // relatório do dia (modelo melhor, uma chamada só), com os dados faltando calculados em SQL
  const quality = await computeQuality(admin, teamId);
  if (stats.processed > 0 || quality.items.some((i) => i.severity === "alta")) {
    try {
      const { data, usage: u } = await callJson({
        system: buildSystem(cfg, userName, facts, "Você está escrevendo o relatório do fim do dia para o vendedor."),
        prompt: reportPrompt(done, stats, quality), schema: reportSchema, tier: "sonnet",
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
