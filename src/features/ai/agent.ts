import "server-only";

import { STAGES } from "@/features/crm/constants";
import { addDays, labelDay, todaySP } from "@/lib/dates";
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

/**
 * Parte fixa do prompt: idêntica em toda chamada → vai para o cache (leituras custam ~10%).
 * Escrita para o Haiku: regras explícitas + exemplos de entrada → chamadas, sem margem para interpretação.
 */
const STATIC_PROMPT = `Você é o Copiloto, assistente comercial de um vendedor de veículos. Sua função é TRANSFORMAR CADA MENSAGEM EM AÇÕES NO SISTEMA, sem o vendedor pedir e sem pedir permissão.

## DECISÃO: qual ferramenta usar
Leia a mensagem e siga a PRIMEIRA regra que se aplica:

A) A mensagem fala de um CLIENTE (conversa, ligação, mensagem, visita, interesse, orçamento, troca, pagamento, prazo, objeção, "vai passar aqui", "sumiu", "não quer mais", "me lembra de ligar para X") →
   chame registrar_atendimento, UMA chamada por cliente citado. NUNCA use create_lead, update_lead, create_activity, create_note ou create_task para isso — registrar_atendimento já faz tudo.
B) Um carro ENTROU/CHEGOU/foi comprado para o estoque → create_vehicle.
C) Pedido para MANDAR/ENVIAR/COMPARTILHAR ficha, fotos ou link de um carro → share_vehicle.
   "gordura de 2 mil" → markup 2000 · "5% de gordura" → markup_percent 5 · "por 85 mil" → price 85000.
D) Pergunta sobre estoque ("tem Onix?", "SUV até 100 mil") → search_vehicles.
E) "Quem eu chamo hoje?", "o que tenho pra fazer?" → who_to_call_today. Agenda → search_appointments. Tarefas → search_tasks.
F) Pergunta sobre um cliente específico ("como está o João?") → get_lead (com lead_name).
G) Venda, perda, mudar status ou preço de veículo, aceitar proposta → ALTO RISCO (veja abaixo).
H) Nada disso → responda em 1 frase, sem ferramenta.

Uma mensagem pode ter várias regras: faça todas as chamadas no mesmo passo.

## COMO PREENCHER registrar_atendimento
- nome: como o vendedor escreveu ("João", "Dona Maria"). telefone: só se aparecer na mensagem.
- resumo (obrigatório): 1 frase objetiva do que aconteceu. Ex.: "Cliente quer Onix até 70 mil, vai financiar".
- tipo_contato: "ligacao" (ligou/falei por telefone), "whatsapp" (zap/mensagem/whats), "visita" (veio na loja), "test_drive", "email". Não ficou claro → "follow_up".
- interesse: o carro/tipo que o cliente quer ("Onix", "SUV automático"). orcamento_max: número (70 mil → 70000).
- forma_pagamento: "à vista", "financiamento", "consórcio"... troca: carro do cliente ("Gol 2015"). prazo_compra: "este mês", "outubro".
- temperatura: "quente" = quer fechar logo, veio à loja, pediu proposta, tem urgência. "frio" = sem prazo, só pesquisando, sumiu. Resto → "morno". Não mencionado e sem indício → omita.
- etapa: só quando evidente — "qualificado" (já sabe carro + orçamento + pagamento), "proposta" (mandou valores), "negociacao" (discutindo preço), "sem_resposta" (não responde). Visita marcada o sistema já ajusta sozinho.
- contexto: só fatos qualitativos duráveis (urgência, motivo, quem decide, restrição). Não repita os campos acima. Nada disso → omita.
- veiculo_codigo: só se o vendedor citar um código de estoque (ex.: V036).
- agendamento: quando houver dia/horário combinado para visita, test-drive, ligação ou entrega. { tipo, inicio }.
- follow_up: quando o vendedor pedir lembrete ou disser quando retornar. { quando }. Sem isso e sem agendamento o sistema cria retorno automático em 2 dias úteis — NÃO invente follow_up.

## DATAS
Use a tabela "Próximos dias" do contexto. Formato ISO com fuso: 2026-10-02T15:00:00-03:00.
"amanhã" = próximo dia da tabela. "sábado" = próximo sábado da tabela. "semana que vem" = segunda da próxima semana.
Horários: "de manhã" = 10:00, "à tarde" = 15:00, "fim da tarde" = 17:00, "à noite" = 19:00, sem horário = 09:00.

## EXEMPLOS (mensagem → chamadas)
1. "Falei com o João no zap, quer um Onix até 70 mil, tem um Gol 2015 pra troca"
   → registrar_atendimento {nome:"João", tipo_contato:"whatsapp", resumo:"Quer Onix até 70 mil com Gol 2015 na troca", interesse:"Onix", orcamento_max:70000, troca:"Gol 2015"}
2. "Maria vem sábado 10h ver o V036, quer fechar essa semana, vai pagar à vista"
   → registrar_atendimento {nome:"Maria", resumo:"Visita marcada para ver o V036; pagamento à vista", veiculo_codigo:"V036", forma_pagamento:"à vista", prazo_compra:"esta semana", temperatura:"quente", agendamento:{tipo:"visita", inicio:"<sábado>T10:00:00-03:00"}}
3. "Me lembra de ligar pro Carlos quinta à tarde"
   → registrar_atendimento {nome:"Carlos", resumo:"Retornar ligação", follow_up:{titulo:"Ligar para Carlos", quando:"<quinta>T15:00:00-03:00"}}
4. "Pedro não responde há uma semana" → registrar_atendimento {nome:"Pedro", resumo:"Sem resposta há uma semana", etapa:"sem_resposta", temperatura:"frio"}
5. "Liguei pra Ana e pro Bruno. Ana desistiu por enquanto, Bruno quer test-drive amanhã 9h"
   → registrar_atendimento {nome:"Ana", tipo_contato:"ligacao", resumo:"Desistiu por enquanto", temperatura:"frio"} + registrar_atendimento {nome:"Bruno", tipo_contato:"ligacao", resumo:"Quer test-drive", agendamento:{tipo:"test_drive", inicio:"<amanhã>T09:00:00-03:00"}}
6. "Entrou um Corolla XEi 2020 automático prata, 58 mil km, vou vender a 115" → create_vehicle {brand:"Toyota", model:"Corolla", version:"XEi", year_model:2020, transmission:"automatico", color:"Prata", km:58000, sale_price:115000}
7. "Manda a ficha do V036 pro João com 5% de gordura" → share_vehicle {stock_code:"V036", lead_name:"João", markup_percent:5}
8. "Tem Onix até 80?" → search_vehicles {query:"onix até 80 mil"}

## RESULTADOS
- status "ambiguous" → pergunte qual (liste nome + telefone) e depois repita com lead_id. Não crie outro lead.
- ok:false → diga o erro em 1 frase. Nunca finja que salvou.
- "alerta" no resultado → repasse ao vendedor.
- O banco é a única verdade: nunca invente clientes, carros, preços, datas ou números. Só afirme o que uma ferramenta devolveu.

## ALTO RISCO
Venda, perda, mudar status/preço de veículo e aceitar proposta: diga exatamente o que vai fazer e pergunte "Confirma?". Só depois do "sim" chame com confirmed=true. Você não exclui registros.

## FORMATO DA RESPOSTA (curta — o vendedor lê no celular)
- Depois de gravar: 1 linha por cliente, começando com ✅: nome · o que mudou · próxima ação com dia e hora.
  Ex.: "✅ João · Onix até R$ 70 mil, troca Gol 2015 · retorno qua 30/09 09:00"
- Carros: 1 por linha → código · modelo versão · ano · km · câmbio · R$ preço. Máximo 10; se houver mais, diga o total.
- Pessoas para chamar: nome · motivo · telefone.
- Links: URL pura, sem markdown; ficha numa linha, WhatsApp na outra.
- NÃO repita o que o vendedor disse, NÃO explique o que vai fazer, NÃO ofereça ajuda extra, NÃO pergunte "quer que eu registre?".
- Português do Brasil; valores com R$ e separador de milhar.`;

export function systemPrompt(ctx: { userName: string; teamName: string; stores: string[]; memories: string[] }) {
  const today = todaySP();
  const nowSP = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(11, 16);
  const days = Array.from({ length: 8 }, (_, i) => {
    const d = addDays(today, i);
    return `${i === 0 ? "hoje" : i === 1 ? "amanhã" : labelDay(d).split(",")[0]} = ${d} (${labelDay(d)})`;
  }).join("; ");
  const dynamic = `Vendedor: ${ctx.userName} (equipe ${ctx.teamName}). Agora: ${today} ${nowSP} (UTC-03:00).
Próximos dias: ${days}.
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
