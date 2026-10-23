import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { chamaQuadro } from "@/features/ai/quadro";
import { dayRangeSP, todaySP } from "@/lib/dates";
import type { AiConfig } from "./config";
import { callJson } from "./llm";
import { buildSystem, EMPRESA_BLOCK } from "./persona";
import { storeFacts } from "./profile";

/**
 * REVISÃO DO CSO (regra da empresa: "um faz, outro revisa"). Às 22h30, depois do feedback da equipe, o CSO revisa
 * o dia de cada agente do Comercial que entregou (tarefas "em revisão" no quadro): aprova com comentário, registra
 * elogio ou erro para o RH quando houver evidência, opina sobre os ajustes que a equipe pediu ao dono e manda o
 * relatório do Comercial para o CEO (tarefa própria entregue no quadro, revisada pelo CEO). O resumo vem para o chat.
 * Não decide aprovação nenhuma: ajuste de instrução continua sendo decisão do dono.
 */

type Admin = SupabaseClient;
const EQUIPE = ["sdr", "follow_up", "pos_venda"];

const revisaoSchema = z.object({
  revisoes: z.array(z.object({
    tarefa_id: z.string(),
    parecer: z.string().min(1).max(400),
    ocorrencia: z.enum(["elogio", "erro", "nenhuma"]),
    ocorrencia_texto: z.string().max(300).nullable(),
  })).max(6),
  sobre_ajustes: z.string().max(600).nullable(),
  relatorio_ceo: z.string().min(1).max(1500),
  para_o_dono: z.string().min(1).max(1200),
});

type Tarefa = { id: string; titulo: string; responsavel: string; status: string; entrega?: string | null };

export async function revisaoDoCso(opts: { admin: Admin; userId: string; teamId: string; userName: string; cfg: AiConfig }) {
  const { admin, userId, teamId, userName, cfg } = opts;
  const dia = todaySP();
  const { start, end } = dayRangeSP(dia);

  // o que a equipe entregou (e o que ficou sem entregar) no quadro
  const listas = await Promise.all(EQUIPE.map((r) => chamaQuadro("tarefas", [], { responsavel: r })));
  const abertas = listas.flatMap((l) => (Array.isArray(l.itens) ? l.itens : [])) as Tarefa[];
  const detalhes = await Promise.all(abertas.map((t) => chamaQuadro("tarefa", [String(t.id)])));
  const aprovacoes = await chamaQuadro("aprovacoes");
  const pedidosEquipe = ((Array.isArray(aprovacoes.itens) ? aprovacoes.itens : []) as { id: string; assunto: string; solicitado_por: string; recomendacao: string | null }[])
    .filter((a) => EQUIPE.includes(a.solicitado_por));

  // números do dia (rodadas da equipe) e o feedback que cada agente escreveu
  const [{ data: runs }, { data: feedbacks }] = await Promise.all([
    admin.from("copilot_runs").select("job,status,stats").eq("user_id", userId).in("job", ["sdr", "follow_up"]).gte("started_at", start).lt("started_at", end),
    admin.from("ai_messages").select("content").eq("user_id", userId).eq("meta->>kind", "feedback").gte("created_at", start).lt("created_at", end),
  ]);
  const soma = (job: string, k: string) => (runs ?? []).filter((r) => r.job === job).reduce((n, r) => n + Number((r.stats as Record<string, unknown>)?.[k] ?? 0), 0);
  const numeros = {
    sdr: { rodadas: (runs ?? []).filter((r) => r.job === "sdr").length, rascunhos: soma("sdr", "rascunhos"), pulados: soma("sdr", "pulados"), campos_preenchidos: soma("sdr", "camposPreenchidos"), erros: soma("sdr", "erros") },
    follow_up: { rodadas: (runs ?? []).filter((r) => r.job === "follow_up").length, avaliados: soma("follow_up", "avaliados"), rascunhos: soma("follow_up", "rascunhos"), aguardar: soma("follow_up", "aguardar"), encerrar: soma("follow_up", "encerrar"), erros: soma("follow_up", "erros") },
  };

  if (!abertas.length && !(runs ?? []).length) return { revisadas: 0 };

  const tarefasTxt = abertas.map((t, i) => {
    const d = detalhes[i] as { historico?: { cargo: string; comentario: string | null; quando: string }[]; entrega?: string | null };
    const hist = (d.historico ?? []).filter((h) => h.comentario).slice(-12).map((h) => `   · ${h.cargo}: ${h.comentario}`).join("\n");
    return `- tarefa ${t.id} · ${t.responsavel} · "${t.titulo}" · status ${t.status}${d.entrega ? ` · entrega: ${String(d.entrega).slice(0, 600)}` : ""}${hist ? `\n${hist}` : ""}`;
  }).join("\n");

  const { data } = await callJson({
    tier: "sonnet", schema: revisaoSchema,
    system: buildSystem(cfg, userName, await storeFacts(admin, teamId), `${EMPRESA_BLOCK}\n\nAgora você está fazendo a REVISÃO DIÁRIA da sua equipe (regra da empresa: um faz, outro revisa). Seja um diretor exigente e justo: elogie com evidência, aponte erro com evidência, nunca invente.`),
    prompt: [
      `DIA: ${dia}.`,
      `NÚMEROS DO DIA (exatos, calculados pelo sistema): ${JSON.stringify(numeros)}`,
      `TAREFAS DA EQUIPE NO QUADRO:\n${tarefasTxt || "(nenhuma)"}`,
      `FEEDBACK QUE A EQUIPE ESCREVEU HOJE:\n${(feedbacks ?? []).map((f) => String(f.content).slice(0, 1500)).join("\n---\n") || "(nenhum)"}`,
      `AJUSTES QUE A EQUIPE PEDIU AO DONO (pendentes):\n${pedidosEquipe.map((a) => `- #${a.id} (${a.solicitado_por}) ${a.assunto} · motivo: ${a.recomendacao ?? "—"}`).join("\n") || "(nenhum)"}`,
      [
        "Faça a revisão:",
        "- revisoes: uma por tarefa da equipe EM REVISÃO (use só os ids listados). parecer = o que ficou bom e o que melhorar amanhã. ocorrencia = 'elogio' ou 'erro' só com evidência clara (vai para a avaliação do RH); senão 'nenhuma'.",
        "- sobre_ajustes: sua opinião de diretor sobre cada ajuste pedido (aprovar ou não, e por quê). A decisão é do dono. null se não houver pedido.",
        "- relatorio_ceo: o dia do Comercial para o CEO, com números, o que andou, o que travou e o plano para amanhã.",
        "- para_o_dono: o mesmo em linguagem direta para o dono ler no celular (curto, crítico, com 1 recomendação).",
      ].join("\n"),
    ].join("\n\n"),
  });

  // revisões: tarefa em revisão vira concluída com o parecer; ocorrência para o RH quando houver
  const emRevisao = new Map(abertas.filter((t) => t.status === "em_revisao").map((t) => [String(t.id), t]));
  let revisadas = 0;
  for (const r of data.revisoes) {
    const t = emRevisao.get(String(r.tarefa_id));
    if (!t) continue;
    await chamaQuadro("status", [String(t.id), "concluida"], { comentario: `Revisão do CSO: ${r.parecer}` });
    revisadas++;
    if (r.ocorrencia !== "nenhuma" && r.ocorrencia_texto) {
      await chamaQuadro("ocorrencia", [], { cargo: t.responsavel, tipo: r.ocorrencia, descricao: r.ocorrencia_texto, tarefa: String(t.id) });
    }
  }

  // relatório para o CEO: tarefa do próprio CSO, entregue (o revisor do CSO é o CEO)
  const titulo = `Relatório do Comercial ${dia.split("-").reverse().join("/")}`;
  const criada = await chamaQuadro("criar", [], { titulo, responsavel: "cso", prioridade: "normal", prazo: `${dia}T23:59:00-03:00`, descricao: "Revisão diária da equipe comercial e relatório para o CEO." });
  const id = (criada.criada as { id?: string } | undefined)?.id;
  if (id) await chamaQuadro("entregar", [String(id)], { entrega: [data.relatorio_ceo, data.sobre_ajustes ? `Ajustes pedidos pela equipe: ${data.sobre_ajustes}` : ""].filter(Boolean).join("\n\n").slice(0, 3000) });

  await admin.from("ai_messages").insert({
    team_id: teamId, user_id: userId, role: "assistant", meta: { kind: "revisao" },
    content: [`**Revisão do CSO**: ${data.para_o_dono}`, data.sobre_ajustes ? `**Sobre os ajustes que a equipe pediu** (você decide na página do CEO)\n${data.sobre_ajustes}` : ""].filter(Boolean).join("\n\n"),
  });
  return { revisadas, relatorio: Boolean(id) };
}
