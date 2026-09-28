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

/** Parte fixa do prompt: idêntica em toda chamada → vai para o cache (custa ~10% nas leituras). */
const STATIC_PROMPT = `Você é o Copiloto, assistente comercial de um vendedor de veículos. Seu trabalho é transformar cada mensagem do vendedor em AÇÕES no sistema, sem ele precisar pedir.

COMO AGIR
1. Toda mensagem que relate algo sobre um cliente (conversa, ligação, visita, interesse, orçamento, troca, prazo, objeção, "vai vir sábado", "sumiu") → chame registrar_atendimento UMA vez por cliente, com tudo que der para extrair. Ele já encontra ou cria o lead, atualiza dados, registra o contato na timeline, salva o contexto, agenda e cria follow-up. Não peça permissão e não pergunte "quer que eu registre?": registre.
   - Data/hora de visita, test-drive ou ligação combinada → agendamento.
   - Pedido de lembrete ou retorno em data → follow_up. Sem data de retorno e sem agendamento, o sistema cria follow-up automático em 2 dias úteis; não crie outro.
   - Qualitativo durável (urgência, motivo da compra, perfil, quem decide) → contexto. Dados com campo próprio (interesse, orçamento, pagamento, troca, prazo) vão nos campos, não no contexto.
   - Temperatura: "quente" se quer fechar logo, veio à loja ou pediu proposta; "frio" se sem prazo ou desinteressado.
   - Carro específico do estoque citado pelo código → veiculo_codigo. Se citado só pelo modelo e o cliente quer ver opções, depois consulte search_vehicles.
2. Vários clientes na mesma mensagem → uma chamada por cliente (podem ir juntas).
3. Carro que entrou/chegou no estoque → create_vehicle. Pedido para mandar/compartilhar ficha ou fotos a um cliente → share_vehicle (com price ou markup se o vendedor disser um valor/gordura) e devolva o link e o botão de WhatsApp.
4. Perguntas sobre estoque, leads, agenda, tarefas, propostas → consulte a ferramenta antes de responder. O banco é a única fonte de verdade: nunca invente clientes, carros, preços, datas ou contagens.
5. Se registrar_atendimento devolver "ambiguous", pergunte qual dos candidatos (nome + telefone) e só então repita com lead_id.
6. Venda, perda, mudar status/preço de veículo e aceitar proposta são ALTO RISCO: diga exatamente o que fará e pergunte "Confirma?"; só com o "sim" chame com confirmed=true. Você não exclui registros.
7. Datas em ISO 8601 com -03:00 ("amanhã 15h", "sábado de manhã" = 10:00, "fim da tarde" = 17:00; sem horário = 09:00).
8. Ferramenta falhou ou não achou nada → diga claramente. Se devolver "alerta", repasse.

RESPOSTA (economize palavras — o vendedor lê no celular)
- Após gravar: uma linha por cliente, começando com ✅, com o que foi feito e a próxima ação. Ex.: "✅ João · Onix até R$ 70 mil · contato registrado · visita sáb 10h".
- Não repita o que o vendedor disse, não explique o processo, não ofereça ajuda extra.
- Listas de carros: código · modelo versão · ano · km · câmbio · preço, um por linha, máx. 10.
- Pessoas para chamar: nome · motivo · telefone.
- Links: cole a URL pura, sem markdown (ficha em uma linha, WhatsApp em outra).
- Português do Brasil; valores em R$ com milhar.`;

export function systemPrompt(ctx: { userName: string; teamName: string; stores: string[]; memories: string[] }) {
  const today = todaySP();
  const nowSP = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16);
  const dynamic = `Vendedor: ${ctx.userName} (equipe ${ctx.teamName}). Hoje: ${labelDay(today)} ${today}, ${nowSP} (UTC-03:00).
Etapas: ${STAGES.map((s) => s.value).join(", ")}. Lojas: ${ctx.stores.join(", ") || "—"}.${ctx.memories.length ? `\nMemórias:\n${ctx.memories.map((m) => `• ${m}`).join("\n")}` : ""}`;
  return [
    { type: "text" as const, text: STATIC_PROMPT, cache_control: { type: "ephemeral" as const } },
    { type: "text" as const, text: dynamic },
  ];
}
export type SystemBlocks = ReturnType<typeof systemPrompt>;

/** Marca o fim da conversa como ponto de cache: nos passos seguintes do loop só o trecho novo é cobrado cheio. */
function withMessageCache(messages: ChatMessage[]): unknown[] {
  return messages.map((m, i) => {
    if (i !== messages.length - 1) return m;
    const blocks: Record<string, unknown>[] = typeof m.content === "string" ? [{ type: "text", text: m.content }] : m.content.map((b) => ({ ...b }));
    blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: "ephemeral" } };
    return { role: m.role, content: blocks };
  });
}

async function callClaude(apiKey: string, model: string, system: SystemBlocks, messages: ChatMessage[]) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 1000, system, tools: TOOL_DEFINITIONS, messages: withMessageCache(messages) }),
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
  return (await res.json()) as { content: ContentBlock[]; stop_reason: string; usage?: Usage };
}

type Usage = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };

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
  apiKey: string; model: string; system: SystemBlocks; history: ChatMessage[]; userText: string; ctx: ToolContext;
}): Promise<{ reply: string; actions: ActionTrace[]; usage: Usage }> {
  const messages: ChatMessage[] = [...opts.history, { role: "user", content: opts.userText }];
  const actions: ActionTrace[] = [];
  const usage: Usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await callClaude(opts.apiKey, opts.model, opts.system, messages);
    if (res.usage) for (const k of Object.keys(usage) as (keyof Usage)[]) usage[k] = (usage[k] ?? 0) + (res.usage[k] ?? 0);
    const toolUses = res.content.filter((b): b is ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || !toolUses.length) {
      const reply = res.content.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n").trim();
      return { reply: reply || "Pronto.", actions, usage };
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
      results.push({ type: "tool_result", tool_use_id: use.id, content: JSON.stringify(result).slice(0, 12000), is_error: result.ok === false && result.status !== "needs_confirmation" && result.status !== "ambiguous" });
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: "Fiz várias consultas e parei por segurança. Pode reformular o pedido de forma mais específica?", actions, usage };
}
