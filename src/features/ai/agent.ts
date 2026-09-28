import "server-only";

import { STAGES } from "@/features/crm/constants";
import { labelDay, todaySP } from "@/lib/dates";
import { TOOL_DEFINITIONS, TOOL_MAP, type ToolContext } from "./tools";

const API_URL = "https://api.anthropic.com/v1/messages";
const MAX_STEPS = 8;

type TextBlock = { type: "text"; text: string };
type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean };
type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;
export type ChatMessage = { role: "user" | "assistant"; content: string | ContentBlock[] };

export type ActionTrace = { tool: string; input: Record<string, unknown>; ok: boolean; status: string; summary: string };

export class CopilotoUnavailable extends Error {}

const CONFIRM_RE = /^\s*(sim|s|confirmo|confirma|confirmado|pode|pode sim|ok|isso|isso mesmo|correto|certo|manda|fechado|autorizo)\b/i;
export const isConfirmation = (text: string) => CONFIRM_RE.test(text) && text.length < 60;

export function systemPrompt(ctx: { userName: string; teamName: string; stores: string[]; memories: string[] }) {
  const today = todaySP();
  const nowSP = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16);
  return `Você é o Copiloto, assistente comercial de ${ctx.userName} (equipe: ${ctx.teamName}), vendedor de veículos.
Hoje é ${labelDay(today)} (${today}), agora são ${nowSP} no horário de Brasília (UTC-03:00).

REGRAS INEGOCIÁVEIS
1. O banco de dados é a única fonte de verdade. NUNCA invente clientes, veículos, preços, datas, contagens ou histórico. Toda informação factual deve vir de uma ferramenta chamada nesta conversa.
2. Para responder sobre estoque, leads, clientes, agenda ou tarefas, CHAME a ferramenta correspondente antes — mesmo que ache que sabe.
3. Quando o usuário relatar algo (conversa com cliente, interesse, orçamento, prazo, lembrete), PERSISTA: crie/atualize o lead, registre o contato (create_activity), crie tarefas/follow-ups e salve contexto qualitativo em create_note. Uma frase pode gerar várias ações.
   Ex.: "Falei com João hoje. Ele quer um Onix até 70 mil e pretende trocar o carro em outubro" →
   search_leads("João") → (se não existir) create_lead{name:"João", interest:"Onix", budget_max:70000, purchase_timeframe:"outubro"} ou update_lead → create_activity{type:"whatsapp" ou "ligacao" conforme dito; se não disser, use "follow_up"} com o resumo.
4. Antes de criar lead, procure se já existe (search_leads). Se houver mais de um candidato, pergunte qual.
   Ao criar lead a partir de uma conversa relatada, use contact_type/contact_summary no próprio create_lead (não duplique com create_activity nem create_note).
   Se uma ferramenta devolver "alerta" (ex.: outro cliente quer o mesmo carro), repasse o alerta ao vendedor.
5. Ações de alto risco (marcar venda/perda, mudar status ou preço de veículo, aceitar proposta) exigem confirmação: descreva exatamente o que fará e pergunte "Confirma?". Só depois do "sim" chame de novo com confirmed=true. Você NÃO pode excluir registros — oriente o usuário a excluir pela tela.
6. Datas: converta expressões ("amanhã", "sexta às 15h", "semana que vem") para ISO 8601 com -03:00. Sem horário informado para tarefa, use 09:00.
7. Se uma ferramenta falhar ou não encontrar nada, diga isso claramente ("Nenhum registro encontrado"). Nunca preencha lacunas com suposições.

ESTILO
- Português do Brasil, direto, frases curtas — o vendedor lê no celular.
- Depois de gravar algo, confirme em 1–3 linhas o que foi salvo (ex.: "✅ Lead João criado · interesse Onix até R$ 70.000 · prazo outubro · contato registrado").
- Ao listar veículos: código, modelo/versão, ano, km, câmbio e preço, um por linha. Máx. 10; diga o total se houver mais.
- Ao listar pessoas para chamar: nome, motivo e telefone.
- Valores em R$ com separador de milhar.

CONTEXTO
- Etapas do funil: ${STAGES.map((s) => `${s.value} (${s.label})`).join(", ")}.
- Lojas: ${ctx.stores.join(", ") || "—"}.
${ctx.memories.length ? `- Memórias salvas:\n${ctx.memories.map((m) => `  • ${m}`).join("\n")}` : ""}`;
}

async function callClaude(apiKey: string, model: string, system: string, messages: ChatMessage[]) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1500, system, tools: TOOL_DEFINITIONS, messages }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403) throw new CopilotoUnavailable("Chave da IA inválida ou revogada. Gere uma nova em console.anthropic.com → API Keys e atualize ANTHROPIC_API_KEY na Vercel.");
    if (/not scoped to a workspace/i.test(body)) {
      throw new CopilotoUnavailable("A chave cadastrada não é uma chave de API de workspace (parece ser uma chave de administração). Crie uma chave comum em console.anthropic.com → API Keys, dentro de um workspace, e atualize ANTHROPIC_API_KEY na Vercel.");
    }
    if (/credit balance|billing/i.test(body)) throw new CopilotoUnavailable("A conta da Anthropic está sem créditos. Adicione créditos em console.anthropic.com → Billing.");
    if (/model/i.test(body) && res.status === 404) throw new CopilotoUnavailable("Modelo de IA indisponível. Ajuste COPILOTO_MODEL na Vercel.");
    if (res.status === 429 || res.status === 529) throw new CopilotoUnavailable("A IA está sobrecarregada agora. Tente em instantes.");
    throw new CopilotoUnavailable(`Falha na IA (${res.status}). ${body.slice(0, 120)}`);
  }
  return (await res.json()) as { content: ContentBlock[]; stop_reason: string };
}

function compactForLog(result: Record<string, unknown>): Record<string, unknown> {
  const text = JSON.stringify(result);
  return text.length <= 20000 ? result : { truncated: true, ok: result.ok, status: result.status ?? null, bytes: text.length };
}

function summarize(result: Record<string, unknown>): string {
  if (result.status === "needs_confirmation") return "aguardando confirmação";
  if (result.status === "ambiguous") return "mais de um candidato";
  if (result.ok === false) return String(result.error ?? "erro");
  for (const k of ["total_encontrado", "total"]) if (typeof result[k] === "number") return `${result[k]} resultado(s)`;
  return "ok";
}

/**
 * Loop de ferramentas: IA interpreta → escolhe ferramenta → ferramenta consulta/grava no banco
 * → resultado volta para a IA → resposta final. Toda chamada é registrada em ai_action_logs.
 */
export async function runCopiloto(opts: {
  apiKey: string; model: string; system: string; history: ChatMessage[]; userText: string; ctx: ToolContext;
}): Promise<{ reply: string; actions: ActionTrace[] }> {
  const messages: ChatMessage[] = [...opts.history, { role: "user", content: opts.userText }];
  const actions: ActionTrace[] = [];

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await callClaude(opts.apiKey, opts.model, opts.system, messages);
    const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const reply = res.content.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: reply || "Pronto.", actions };
    }
    messages.push({ role: "assistant", content: res.content });

    const results: ToolResultBlock[] = [];
    for (const use of toolUses) {
      const tool = TOOL_MAP.get(use.name);
      let result: Record<string, unknown>;
      try {
        result = tool ? await tool.run(use.input ?? {}, opts.ctx) : { ok: false, error: `Ferramenta desconhecida: ${use.name}` };
      } catch (e) {
        result = { ok: false, error: e instanceof Error ? e.message.slice(0, 200) : "erro inesperado" };
      }
      const status = result.status === "needs_confirmation" ? "pendente_confirmacao" : result.ok === false ? "erro" : "sucesso";
      actions.push({ tool: use.name, input: use.input, ok: result.ok !== false, status, summary: summarize(result) });
      // auditoria (falha de log não interrompe a conversa)
      await opts.ctx.supabase.from("ai_action_logs").insert({
        team_id: opts.ctx.teamId, user_id: opts.ctx.userId, command: opts.userText.slice(0, 2000), tool: use.name,
        input: use.input ?? {}, result: compactForLog(result), status,
      }).then(() => undefined, () => undefined);
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result).slice(0, 30000), is_error: result.ok === false && result.status !== "needs_confirmation" && result.status !== "ambiguous" });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Fiz várias consultas e parei por segurança. Pode reformular o pedido de forma mais específica?", actions };
}
