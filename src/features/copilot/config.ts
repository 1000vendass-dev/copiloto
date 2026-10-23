import { z } from "zod";

/**
 * Perfil da IA de cada usuário (aba "IA"). Guardado em ai_profiles.config (jsonb) e SEMPRE lido por aqui:
 * valores ausentes ou antigos viram o padrão, então dá para acrescentar opções sem migration.
 */

export const PRESETS = {
  parceiro: {
    label: "Parceiro", hint: "Próximo e motivador",
    style: "Fale como um parceiro de time: próximo, animado, comemora vitórias de verdade e apoia nos dias ruins, sem exagero.",
  },
  coach: {
    label: "Coach", hint: "Direto, cobra meta",
    style: "Fale como um coach de vendas: direto, sem rodeio, cobra metas e tarefas atrasadas com respeito e firmeza, e aponta o próximo passo.",
  },
  analista: {
    label: "Analista", hint: "Números e fatos",
    style: "Fale como um analista comercial: objetivo, apoiado em números e fatos, curto, sem floreio; destaque o que os dados mostram.",
  },
  mentor: {
    label: "Mentor", hint: "Explica e ensina",
    style: "Fale como um mentor de vendas: explique o porquê das sugestões, ensine técnicas pelo exemplo e incentive o vendedor a pensar.",
  },
} as const;
export type PresetKey = keyof typeof PRESETS;
export const PRESET_KEYS = Object.keys(PRESETS) as [PresetKey, ...PresetKey[]];

export const TONES = [
  { value: "amigavel", label: "Amigável" },
  { value: "direto", label: "Direto" },
  { value: "formal", label: "Formal" },
] as const;

export const AUTONOMY = [
  { value: 0, label: "Nível 0 · Só quando eu pedir", hint: "A IA só age quando você fala com ela no chat." },
  { value: 1, label: "Nível 1 · Rotinas automáticas", hint: "Resumos, memória, tarefas, relatório e alertas. Não envia nada." },
  { value: 2, label: "Nível 2 · Rotinas + rascunhos", hint: "Tudo do nível 1 e deixa rascunhos de follow-up prontos. Você toca em Enviar." },
] as const;

const hour = (min: number, max: number, def: number) => z.number().int().min(min).max(max).default(def);

export const configSchema = z.object({
  identity: z.object({
    name: z.string().trim().min(1).max(30).default("Copiloto"),
    emoji: z.string().trim().max(4).default("🧭"),
    preset: z.enum(PRESET_KEYS).default("parceiro"),
    tone: z.enum(["amigavel", "direto", "formal"]).default("amigavel"),
    emojis: z.boolean().default(true),
    /** Como a IA chama o vendedor. Vazio = primeiro nome. */
    address: z.string().trim().max(30).default(""),
    /** Responde assuntos fora de vendas? Desligado: responde curto e volta ao CRM. */
    offTopic: z.boolean().default(false),
  }).prefault({}),
  goals: z.object({
    salesPerMonth: z.number().int().min(0).max(1000).nullable().default(null),
    visitsPerWeek: z.number().int().min(0).max(500).nullable().default(null),
  }).prefault({}),
  /** Texto livre do vendedor. Vale sempre, mas nunca passa por cima do núcleo travado (ver persona.ts). */
  instructions: z.string().max(2000).default(""),
  routines: z.object({
    /** A IA só trabalha dentro desta janela (o relógio chama de hora em hora). 24 = meia-noite. */
    window: z.object({ from: hour(0, 23, 6), to: hour(1, 24, 24) }).prefault({}),
    nightly: z.object({ enabled: z.boolean().default(true), hour: hour(0, 23, 21) }).prefault({}),
    /** Follow-up (Nível 2): reativa o cliente depois de tantas horas sem responder à última mensagem do vendedor. */
    followup: z.object({ semRespostaHoras: hour(1, 72, 6) }).prefault({}),
  }).prefault({}),
});
export type AiConfig = z.infer<typeof configSchema>;

export function parseConfig(raw: unknown): AiConfig {
  const r = configSchema.safeParse(raw ?? {});
  return r.success ? r.data : configSchema.parse({});
}

export const defaultConfig = (): AiConfig => configSchema.parse({});

/** 0 vira 24 para comparar com a janela (00h é o fim do dia de trabalho, não o começo). */
export const effectiveHour = (h: number) => (h === 0 ? 24 : h);

export function inWindow(cfg: AiConfig, hourSP: number): boolean {
  const h = effectiveHour(hourSP);
  return h >= cfg.routines.window.from && h <= cfg.routines.window.to;
}
