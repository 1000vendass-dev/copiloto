import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todaySP } from "@/lib/dates";
import { effectiveHour, inWindow, parseConfig } from "./config";
import { runNightly } from "./nightly";
import type { AiProfile } from "./profile";

type Admin = SupabaseClient;
const STALE_MS = 45 * 60 * 1000;
const MAX_ATTEMPTS = 3;

export async function userNameOf(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return (data?.full_name as string | undefined)?.trim() || "vendedor";
}

type Start = { ok: true; runId: string } | { ok: false; reason: string };

/**
 * Reserva a execução (uma por usuário+rotina+período, então rodar duas vezes não duplica) e dispara em segundo plano.
 * Falhou antes? Tenta de novo nas próximas rodadas, até 3 vezes. "Rodando" há mais de 45 min é considerado travado.
 */
export async function startNightly(admin: Admin, p: AiProfile, trigger: "agenda" | "manual", period: string): Promise<Start> {
  const row = { team_id: p.teamId, user_id: p.userId, job: "nightly", period, trigger, status: "rodando", stats: { attempts: 1 } };
  let runId: string | null = null;

  const ins = await admin.from("copilot_runs").insert(row).select("id").single();
  if (ins.data) runId = ins.data.id as string;
  else if (ins.error?.code === "23505") {
    const { data: old } = await admin.from("copilot_runs").select("id,status,started_at,stats").eq("user_id", p.userId).eq("job", "nightly").eq("period", period).maybeSingle();
    if (!old) return { ok: false, reason: "conflito" };
    const attempts = Number((old.stats as { attempts?: number } | null)?.attempts ?? 1);
    const stale = old.status === "rodando" && Date.now() - new Date(old.started_at as string).getTime() > STALE_MS;
    if ((old.status === "erro" || stale) && attempts < MAX_ATTEMPTS) {
      await admin.from("copilot_runs").update({ status: "rodando", error: null, started_at: new Date().toISOString(), finished_at: null, stats: { attempts: attempts + 1 } }).eq("id", old.id);
      runId = old.id as string;
    } else return { ok: false, reason: old.status === "rodando" ? "já está rodando" : "já rodou neste período" };
  } else return { ok: false, reason: ins.error?.message ?? "erro ao reservar" };

  const id = runId;
  void (async () => {
    try {
      const stats = await runNightly({ admin, userId: p.userId, teamId: p.teamId, userName: await userNameOf(admin, p.userId), cfg: p.config, autonomy: p.autonomy, runId: id });
      const status = stats.processed === 0 && stats.errors > 0 ? "erro" : stats.partial || stats.errors > 0 ? "parcial" : "ok";
      const { data: cur } = await admin.from("copilot_runs").select("stats").eq("id", id).maybeSingle();
      await admin.from("copilot_runs").update({
        status, finished_at: new Date().toISOString(), stats: { ...(cur?.stats as object), ...stats },
        error: status === "erro" ? "Nenhum cliente foi analisado (veja os logs)." : null,
      }).eq("id", id);
    } catch (e) {
      console.error("[nightly]", e instanceof Error ? e.message : e);
      const { data: cur } = await admin.from("copilot_runs").select("stats").eq("id", id).maybeSingle();
      await admin.from("copilot_runs").update({ status: "erro", finished_at: new Date().toISOString(), error: (e instanceof Error ? e.message : "erro").slice(0, 300), stats: cur?.stats ?? {} }).eq("id", id);
    }
  })();
  return { ok: true, runId: id };
}

export const hourSP = (now = new Date()) =>
  Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" }).format(now)) % 24;

/**
 * O relógio (container copiloto-cron) chama isto de hora em hora. Aqui se decide o que está na hora,
 * por usuário: respeita o nível de autonomia, a janela de trabalho (padrão 06h–00h) e o horário de cada rotina.
 * Fora da janela a IA não trabalha (e não gasta nada).
 */
export async function tick(admin: Admin, now = new Date()) {
  const hour = hourSP(now);
  const { data: rows } = await admin.from("ai_profiles").select("user_id,team_id,autonomy,config").gte("autonomy", 1);
  const started: string[] = [];
  const skipped: string[] = [];
  for (const r of rows ?? []) {
    const p: AiProfile = { userId: r.user_id as string, teamId: r.team_id as string, autonomy: (r.autonomy === 2 ? 2 : 1), config: parseConfig(r.config) };
    if (!inWindow(p.config, hour)) { skipped.push(`${p.userId.slice(0, 8)}: fora da janela`); continue; }
    const n = p.config.routines.nightly;
    if (n.enabled && effectiveHour(hour) >= n.hour) {
      // 00h é o fim do dia que acabou: conta como o dia anterior
      const period = hour === 0 ? addDays(todaySP(now), -1) : todaySP(now);
      const res = await startNightly(admin, p, "agenda", period);
      if (res.ok) started.push(`${p.userId.slice(0, 8)}: nightly ${period}`);
      else skipped.push(`${p.userId.slice(0, 8)}: nightly (${res.reason})`);
    }
  }
  return { hour, started, skipped };
}
