import "server-only";

import { z } from "zod";

/**
 * Chamada estruturada à IA para as rotinas automáticas: pede JSON num schema, valida com zod e tenta de novo
 * uma vez se vier fora do formato. Motor: ponte do Claude Code (assinatura) quando COPILOTO_BRIDGE_URL existe;
 * senão a API paga (ANTHROPIC_API_KEY). O motor é escolhido aqui, num lugar só.
 */

export type Tier = "haiku" | "sonnet";
export type Usage = { input: number; output: number; calls: number };
export const emptyUsage = (): Usage => ({ input: 0, output: 0, calls: 0 });

export class LlmUnavailable extends Error {}

const API_MODELS: Record<Tier, string> = {
  haiku: process.env.COPILOTO_MODEL_FAST || "claude-haiku-5-5",
  sonnet: process.env.COPILOTO_MODEL_SMART || "claude-sonnet-5-5",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function jsonSchemaOf(schema: z.ZodType): Record<string, unknown> {
  const js = z.toJSONSchema(schema) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

type Raw = { output: unknown; usage: Usage };

async function viaBridge(system: string, prompt: string, schema: Record<string, unknown>, tier: Tier): Promise<Raw> {
  const base = process.env.COPILOTO_BRIDGE_URL!.replace(/\/$/, "");
  for (let attempt = 0; attempt < 5; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${base}/v1/json`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${process.env.COPILOTO_BRIDGE_TOKEN ?? ""}` },
        body: JSON.stringify({ system, prompt, schema, model: tier }),
        signal: AbortSignal.timeout(270_000),
      });
    } catch (e) {
      throw new LlmUnavailable(e instanceof Error && e.name === "TimeoutError" ? "A IA demorou demais." : "Não consegui falar com o Claude Code da VPS.");
    }
    if (res.status === 429) { await sleep(20_000); continue; } // ocupado com o chat: espera a vez
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (/limit|usage|quota/i.test(body)) throw new LlmUnavailable("O limite de uso da assinatura do Claude acabou por agora.");
      if (/not logged in|login|auth/i.test(body)) throw new LlmUnavailable("O Claude Code da VPS está sem login.");
      throw new Error(`Ponte respondeu ${res.status}: ${body.slice(0, 120)}`);
    }
    const j = (await res.json()) as { output: unknown; usage?: { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number; cache_read_input_tokens?: number } };
    const u = j.usage ?? {};
    return { output: j.output, usage: { input: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0), output: u.output_tokens ?? 0, calls: 1 } };
  }
  throw new LlmUnavailable("A IA está ocupada. Tento de novo na próxima rodada.");
}

async function viaApi(system: string, prompt: string, schema: Record<string, unknown>, tier: Tier): Promise<Raw> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new LlmUnavailable("IA não configurada (falta COPILOTO_BRIDGE_URL ou ANTHROPIC_API_KEY).");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: API_MODELS[tier], max_tokens: 4000, system,
      tools: [{ name: "responder", description: "Entrega a resposta final no formato pedido.", input_schema: schema }],
      tool_choice: { type: "tool", name: "responder" },
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    if (res.status === 429 || res.status === 529) throw new LlmUnavailable("A IA está sobrecarregada agora.");
    throw new LlmUnavailable(`Falha na IA (${res.status}).`);
  }
  const j = (await res.json()) as { content: { type: string; input?: unknown }[]; usage?: { input_tokens?: number; output_tokens?: number } };
  const block = j.content.find((b) => b.type === "tool_use");
  return { output: block?.input, usage: { input: j.usage?.input_tokens ?? 0, output: j.usage?.output_tokens ?? 0, calls: 1 } };
}

export async function callJson<S extends z.ZodType>(task: { system: string; prompt: string; schema: S; tier?: Tier }): Promise<{ data: z.infer<S>; usage: Usage }> {
  const tier = task.tier ?? "haiku";
  const schema = jsonSchemaOf(task.schema);
  const call = process.env.COPILOTO_BRIDGE_URL ? viaBridge : viaApi;
  const usage = emptyUsage();
  let prompt = task.prompt;
  let lastIssue = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await call(task.system, prompt, schema, tier);
    usage.input += raw.usage.input; usage.output += raw.usage.output; usage.calls += raw.usage.calls;
    const parsed = task.schema.safeParse(raw.output);
    if (parsed.success) return { data: parsed.data, usage };
    lastIssue = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "raiz"}: ${i.message}`).join("; ");
    prompt = `${task.prompt}\n\nATENÇÃO: sua resposta anterior não seguiu o formato (${lastIssue}). Responda de novo, no formato exato.`;
  }
  throw new Error(`Resposta da IA fora do formato: ${lastIssue}`);
}
