import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { chamaQuadro } from "@/features/ai/quadro";
import { todaySP } from "@/lib/dates";
import { aprendizadosAprovados, proporAjuste } from "./aprendizados";
import type { AiConfig } from "./config";
import { callJson } from "./llm";
import { buildSystem } from "./persona";
import { storeFacts } from "./profile";

/**
 * FEEDBACK DO DIA dos agentes da equipe comercial (decisão do dono: agente não é engessado, dá feedback e melhora
 * com o uso). Às 22h, cada agente mede o próprio trabalho das últimas 24h — rascunho enviado como estava, editado,
 * descartado, ainda pendente, e se o cliente respondeu depois do envio — e escreve o que funcionou, o que não
 * funcionou e até 2 ajustes nas próprias instruções. O relatório vai para o chat e para a tarefa do dia no quadro;
 * cada ajuste vira um pedido de aprovação do dono (página do CEO). Aprovado, volta para o prompt do agente.
 */

type Admin = SupabaseClient;
const H = 3600 * 1000;

export type Agente = { cargo: "follow_up" | "sdr"; nome: string; papel: string; token: string | undefined; tarefaDoDia: (dia: string) => Promise<string | null> };

const feedbackSchema = z.object({
  resumo: z.string().min(1).max(900),
  funcionou: z.array(z.string().max(200)).max(4),
  nao_funcionou: z.array(z.string().max(200)).max(4),
  ajustes: z.array(z.object({ instrucao: z.string().min(5).max(220), motivo: z.string().min(5).max(300) })).max(2),
});

type Rascunho = { id: string; lead_id: string; body: string; status: string; created_at: string };
type Msg = { conversation_id: string; direction: string; body: string | null; sent_at: string };
const norm = (s: string | null) => (s ?? "").replace(/\s+/g, " ").trim().toLowerCase();

/** O que aconteceu com cada rascunho do agente nas últimas 24h. */
async function resultados(admin: Admin, teamId: string, source: string) {
  const desde = new Date(Date.now() - 24 * H).toISOString();
  const { data } = await admin.from("whatsapp_drafts").select("id,lead_id,body,status,created_at").eq("team_id", teamId).eq("source", source).gte("created_at", desde);
  const rascunhos = (data ?? []) as Rascunho[];
  const leadIds = [...new Set(rascunhos.map((r) => r.lead_id))];
  const msgsDe = new Map<string, Msg[]>();
  if (leadIds.length) {
    const { data: contacts } = await admin.from("whatsapp_contacts").select("id,lead_id").in("lead_id", leadIds);
    const leadDoContato = new Map((contacts ?? []).map((c) => [c.id as string, c.lead_id as string]));
    const { data: convs } = await admin.from("whatsapp_conversations").select("id,contact_id").in("contact_id", [...leadDoContato.keys()]);
    const leadDaConv = new Map((convs ?? []).map((c) => [c.id as string, leadDoContato.get(c.contact_id as string)!]));
    if (leadDaConv.size) {
      const { data: msgs } = await admin.from("whatsapp_messages").select("conversation_id,direction,body,sent_at")
        .in("conversation_id", [...leadDaConv.keys()]).gte("sent_at", desde).order("sent_at", { ascending: true }).limit(3000);
      for (const m of (msgs ?? []) as Msg[]) {
        const lead = leadDaConv.get(m.conversation_id);
        if (lead) msgsDe.set(lead, [...(msgsDe.get(lead) ?? []), m]);
      }
    }
  }
  const itens = rascunhos.map((r) => {
    const depois = (msgsDe.get(r.lead_id) ?? []).filter((m) => m.sent_at > r.created_at);
    const enviada = r.status === "enviado" ? depois.find((m) => m.direction !== "entrada") : undefined;
    const editado = enviada ? norm(enviada.body) !== norm(r.body) : false;
    const respondeu = enviada ? depois.some((m) => m.direction === "entrada" && m.sent_at > enviada.sent_at) : false;
    const resultado = r.status === "enviado" ? (editado ? "enviado com edição" : "enviado como estava") : r.status === "descartado" ? "descartado" : "pendente";
    return { rascunho: r.body, enviado: editado ? enviada?.body ?? null : null, resultado, respondeu };
  });
  const conta = (f: (i: (typeof itens)[number]) => boolean) => itens.filter(f).length;
  return {
    itens,
    numeros: {
      rascunhos: itens.length, enviados_como_estava: conta((i) => i.resultado === "enviado como estava"), enviados_com_edicao: conta((i) => i.resultado === "enviado com edição"),
      descartados: conta((i) => i.resultado === "descartado"), pendentes: conta((i) => i.resultado === "pendente"), clientes_responderam: conta((i) => i.respondeu),
    },
  };
}

export async function feedbackDoDia(opts: { admin: Admin; userId: string; teamId: string; userName: string; cfg: AiConfig; agente: Agente }) {
  const { admin, userId, teamId, userName, cfg, agente } = opts;
  const { itens, numeros } = await resultados(admin, teamId, agente.cargo);
  const tarefa = await agente.tarefaDoDia(todaySP());
  if (!numeros.rascunhos) {
    if (tarefa && agente.token) await chamaQuadro("entregar", [tarefa], { entrega: "Dia sem rascunhos: nada para medir." }, agente.token);
    return { rascunhos: 0 };
  }
  const aprovados = await aprendizadosAprovados(agente.cargo, agente.token);
  const amostra = itens.slice(0, 12).map((i, n) => `${n + 1}. [${i.resultado}${i.respondeu ? ", cliente respondeu" : ""}] rascunho: "${i.rascunho.slice(0, 300)}"${i.enviado ? `\n   o vendedor mandou assim: "${i.enviado.slice(0, 300)}"` : ""}`).join("\n");
  const { data } = await callJson({
    tier: "sonnet", schema: feedbackSchema,
    system: buildSystem(cfg, userName, await storeFacts(admin, teamId), `Você é o ${agente.nome} da equipe comercial (empresa de agentes do dono; chefe: CSO). ${agente.papel} Agora você está fazendo o FEEDBACK DO SEU PRÓPRIO DIA, com honestidade.`),
    prompt: [
      `NÚMEROS DAS ÚLTIMAS 24H (exatos, calculados pelo sistema): ${JSON.stringify(numeros)}`,
      `APRENDIZADOS JÁ APROVADOS (não repita): ${aprovados.length ? aprovados.join(" | ") : "nenhum"}`,
      `SEUS RASCUNHOS E O QUE ACONTECEU:\n${amostra}`,
      [
        "Escreva o feedback do seu dia para o dono e o CSO:",
        "- resumo: 2 a 4 frases honestas com os números (enviado como estava = acertou; editado = quase; descartado = errou o tom ou o momento).",
        "- funcionou / nao_funcionou: padrões concretos tirados dos exemplos (ex.: 'mensagens com o nome do carro foram enviadas sem edição').",
        "- ajustes: no máximo 2 instruções novas para VOCÊ mesmo, curtas e acionáveis, só se a evidência do dia sustentar. Compare o que você escreveu com o que o vendedor mandou: as edições dele mostram o jeito dele. Sem evidência, devolva lista vazia.",
      ].join("\n"),
    ].join("\n\n"),
  });

  const texto = [
    `**Feedback do ${agente.nome}**: ${data.resumo}`,
    data.funcionou.length ? `**Funcionou**\n${data.funcionou.map((f) => `- ${f}`).join("\n")}` : "",
    data.nao_funcionou.length ? `**Não funcionou**\n${data.nao_funcionou.map((f) => `- ${f}`).join("\n")}` : "",
    data.ajustes.length ? `**Ajustes que proponho** (aprovar ou recusar na página do CEO)\n${data.ajustes.map((a) => `- ${a.instrucao}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
  await admin.from("ai_messages").insert({ team_id: teamId, user_id: userId, role: "assistant", content: texto, meta: { kind: "feedback" } });

  if (agente.token) {
    for (const a of data.ajustes) await proporAjuste(agente.cargo, agente.token, a.instrucao, a.motivo);
    if (tarefa) await chamaQuadro("entregar", [tarefa], { entrega: `Feedback: ${data.resumo}`.slice(0, 1500), comentario: `Números: ${JSON.stringify(numeros)}` }, agente.token);
  }
  return { rascunhos: numeros.rascunhos, ajustes: data.ajustes.length };
}
