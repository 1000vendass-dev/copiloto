import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, todaySP } from "@/lib/dates";
import { effectiveHour, inWindow, parseConfig } from "./config";
import { feedbackDoDia, type Agente } from "./feedback";
import { FOLLOWUP_HOURS, runFollowup, tarefaDoDiaFollowup } from "./followup";
import { runNightly } from "./nightly";
import { revisaoDoCso } from "./revisao-cso";
import { SDR_HOURS, runSdr, tarefaDoDiaSdr } from "./sdr";
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

const minuteSP = (now = new Date()) => Number(new Intl.DateTimeFormat("en-GB", { minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(now));

/**
 * O relógio (container copiloto-cron) chama isto a cada 15 minutos. Aqui se decide o que está na hora,
 * por usuário: respeita o nível de autonomia, a janela de trabalho (padrão 06h–00h) e o horário de cada rotina.
 * As rotinas de hora em hora (noite, Follow-up) não duplicam: cada uma reserva o seu período em copilot_runs.
 * Fora da janela a IA não trabalha (e não gasta nada).
 */
export async function tick(admin: Admin, now = new Date()) {
  const hour = hourSP(now);
  const quarto = Math.floor(minuteSP(now) / 15) * 15;
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
    // Follow-up (equipe do CSO) = "Nível 2 · Rotinas + rascunhos". Só com esse nível e com o cargo ligado
    // no quadro da empresa, de hora em hora das 7h às 21h.
    if (p.autonomy === 2 && process.env.QUADRO_API_TOKEN_FOLLOW_UP && hour >= FOLLOWUP_HOURS.from && hour <= FOLLOWUP_HOURS.to) {
      const period = `${todaySP(now)}T${String(hour).padStart(2, "0")}`;
      const res = await startEquipe(admin, p, "follow_up", period, async (userName) =>
        runFollowup({ admin, userId: p.userId, teamId: p.teamId, userName, cfg: p.config, hora: hour }));
      if (res.ok) started.push(`${p.userId.slice(0, 8)}: follow-up ${period}`);
      else skipped.push(`${p.userId.slice(0, 8)}: follow-up (${res.reason})`);
    }
    // SDR (equipe do CSO, lead novo): também Nível 2, a cada 15 min das 7h às 21h. Mensagem de fora do
    // horário fica para a primeira checagem das 7h. Às 22h entrega a tarefa do dia no quadro.
    if (p.autonomy === 2 && process.env.QUADRO_API_TOKEN_SDR) {
      if (hour >= SDR_HOURS.from && hour <= SDR_HOURS.to) {
        const period = `${todaySP(now)}T${String(hour).padStart(2, "0")}:${String(quarto).padStart(2, "0")}`;
        const res = await startEquipe(admin, p, "sdr", period, async (userName) =>
          runSdr({ admin, userId: p.userId, teamId: p.teamId, userName, cfg: p.config, hora: hour, minuto: quarto }));
        if (res.ok) started.push(`${p.userId.slice(0, 8)}: sdr ${period}`);
        else skipped.push(`${p.userId.slice(0, 8)}: sdr (${res.reason})`);
      }
    }
    // 22h: feedback do dia de cada agente da equipe (mede o próprio trabalho, propõe ajustes, entrega a tarefa do dia)
    if (p.autonomy === 2 && hour === SDR_HOURS.to + 1) {
      const agentes: Agente[] = [
        { cargo: "follow_up", nome: "Follow-up", papel: "Você é o dono dos follow-ups do vendedor: decide quem chamar, como, quando e quando parar.", token: process.env.QUADRO_API_TOKEN_FOLLOW_UP, tarefaDoDia: tarefaDoDiaFollowup },
        { cargo: "sdr", nome: "SDR", papel: "Você é o dono do lead novo: acolhe, responde com o estoque real e qualifica.", token: process.env.QUADRO_API_TOKEN_SDR, tarefaDoDia: tarefaDoDiaSdr },
      ];
      for (const agente of agentes.filter((a) => a.token)) {
        const res = await startEquipe(admin, p, `feedback_${agente.cargo}`, todaySP(now), async (userName) =>
          feedbackDoDia({ admin, userId: p.userId, teamId: p.teamId, userName, cfg: p.config, agente }));
        if (res.ok) started.push(`${p.userId.slice(0, 8)}: feedback ${agente.cargo}`);
      }
      // 22h30: o CSO revisa o dia da equipe (um faz, outro revisa) e manda o relatório do Comercial para o CEO
      if (quarto >= 30 && process.env.QUADRO_API_TOKEN) {
        const res = await startEquipe(admin, p, "revisao_cso", todaySP(now), async (userName) =>
          revisaoDoCso({ admin, userId: p.userId, teamId: p.teamId, userName, cfg: p.config }));
        if (res.ok) started.push(`${p.userId.slice(0, 8)}: revisão do CSO`);
      }
    }
  }
  return { hour, started, skipped };
}

/** Rotina da equipe comercial: uma rodada por período (a chave period impede duplicar), em segundo plano. */
async function startEquipe(admin: Admin, p: AiProfile, job: string, period: string, run: (userName: string) => Promise<object>): Promise<Start> {
  const ins = await admin.from("copilot_runs")
    .insert({ team_id: p.teamId, user_id: p.userId, job, period, trigger: "agenda", status: "rodando", stats: {} })
    .select("id").single();
  if (!ins.data) return { ok: false, reason: ins.error?.code === "23505" ? "já rodou neste período" : ins.error?.message ?? "erro ao reservar" };
  const id = ins.data.id as string;
  void (async () => {
    try {
      const stats = (await run(await userNameOf(admin, p.userId))) as { erros?: number; rascunhos?: number; pulados?: number; parcial?: boolean };
      const status = stats.erros && !stats.rascunhos && !stats.pulados ? "erro" : stats.parcial || stats.erros ? "parcial" : "ok";
      await admin.from("copilot_runs").update({ status, finished_at: new Date().toISOString(), stats }).eq("id", id);
    } catch (e) {
      console.error(`[${job}]`, e instanceof Error ? e.message : e);
      await admin.from("copilot_runs").update({ status: "erro", finished_at: new Date().toISOString(), error: (e instanceof Error ? e.message : "erro").slice(0, 300) }).eq("id", id);
    }
  })();
  return { ok: true, runId: id };
}
