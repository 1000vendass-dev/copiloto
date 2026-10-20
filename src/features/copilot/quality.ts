import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { OPEN_STAGES } from "@/features/crm/constants";
import { dayRangeSP, todaySP, weekStart } from "@/lib/dates";

/**
 * "O que falta no sistema": checagens em SQL (nada de IA). O resultado alimenta o relatório da noite
 * e, depois, o vigia. Cada item diz quantos casos há e dá alguns nomes de exemplo.
 */

export type QualityItem = { key: string; label: string; count: number; sample: string[]; severity: "alta" | "media" | "baixa" };
export type Quality = { items: QualityItem[]; visitsThisWeek: number };

const names = (rows: { name?: string | null }[] | null, n = 4) => (rows ?? []).slice(0, n).map((r) => r.name ?? "—");

export async function computeQuality(admin: SupabaseClient, teamId: string): Promise<Quality> {
  const items: QualityItem[] = [];
  const open = OPEN_STAGES as string[];
  const nowIso = new Date().toISOString();
  const weekStartIso = dayRangeSP(weekStart(todaySP())).start;

  const [visits, noSource, noPhone, hotNoNext, overdue, audioNoText, waiting] = await Promise.all([
    admin.from("activities").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("type", "visita").gte("occurred_at", weekStartIso),
    admin.from("leads").select("name", { count: "exact" }).eq("team_id", teamId).in("stage", open).or("source.is.null,source.eq.").limit(4),
    admin.from("leads").select("name", { count: "exact" }).eq("team_id", teamId).in("stage", open).is("phone", null).limit(4),
    admin.from("leads").select("id,name").eq("team_id", teamId).in("stage", open).eq("temperature", "quente").is("next_action_at", null).limit(40),
    admin.from("tasks").select("title", { count: "exact" }).eq("team_id", teamId).eq("status", "pendente").lt("due_at", nowIso).limit(4),
    admin.from("whatsapp_messages").select("id", { count: "exact", head: true }).eq("team_id", teamId).eq("type", "audio").is("transcript", null)
      .gte("created_at", new Date(Date.now() - 3 * 86400000).toISOString()),
    admin.from("whatsapp_conversations").select("contact_id,unread_count").eq("team_id", teamId).gt("unread_count", 0)
      .lt("last_message_at", new Date(Date.now() - 12 * 3600000).toISOString()).limit(40),
  ]);

  const visitsThisWeek = visits.count ?? 0;
  if (visitsThisWeek === 0) items.push({ key: "sem_visitas", label: "Nenhuma visita registrada esta semana (use o botão Veio na loja)", count: 1, sample: [], severity: "alta" });

  if ((noSource.count ?? 0) > 0) items.push({ key: "sem_origem", label: "Leads em aberto sem origem (de onde vieram)", count: noSource.count ?? 0, sample: names(noSource.data), severity: "media" });
  if ((noPhone.count ?? 0) > 0) items.push({ key: "sem_telefone", label: "Leads em aberto sem telefone", count: noPhone.count ?? 0, sample: names(noPhone.data), severity: "media" });

  // quente sem próxima ação (e sem tarefa pendente)
  const hotIds = (hotNoNext.data ?? []).map((l) => l.id as string);
  if (hotIds.length) {
    const { data: pend } = await admin.from("tasks").select("lead_id").eq("status", "pendente").in("lead_id", hotIds);
    const has = new Set((pend ?? []).map((t) => t.lead_id as string));
    const lonely = (hotNoNext.data ?? []).filter((l) => !has.has(l.id as string));
    if (lonely.length) items.push({ key: "quente_sem_acao", label: "Leads quentes sem próxima ação", count: lonely.length, sample: names(lonely as { name: string }[]), severity: "alta" });
  }

  if ((overdue.count ?? 0) > 0) items.push({ key: "tarefas_atrasadas", label: "Tarefas atrasadas", count: overdue.count ?? 0, sample: (overdue.data ?? []).map((t) => t.title as string).slice(0, 3), severity: "alta" });

  if ((audioNoText.count ?? 0) > 0) items.push({ key: "audio_sem_texto", label: "Áudios (últimos 3 dias) sem transcrição", count: audioNoText.count ?? 0, sample: [], severity: "baixa" });

  const cIds = (waiting.data ?? []).map((c) => c.contact_id as string);
  if (cIds.length) {
    const { data: contacts } = await admin.from("whatsapp_contacts").select("lead_id,categoria").in("id", cIds);
    const leadIds = (contacts ?? []).filter((c) => c.categoria === "cliente" && c.lead_id).map((c) => c.lead_id as string);
    if (leadIds.length) {
      const { data: leads } = await admin.from("leads").select("name,stage").in("id", leadIds);
      const live = (leads ?? []).filter((l) => open.includes(l.stage as string));
      if (live.length) items.push({ key: "esperando_resposta", label: "Clientes esperando resposta há mais de 12h", count: live.length, sample: names(live as { name: string }[]), severity: "alta" });
    }
  }

  const order = { alta: 0, media: 1, baixa: 2 } as const;
  items.sort((a, b) => order[a.severity] - order[b.severity]);
  return { items, visitsThisWeek };
}
