import { z } from "zod";
import { CONTACT_TYPE_VALUES, STAGE_VALUES, TEMPERATURE_VALUES } from "./constants";

/** "" → null; aceita "70.000", "70000", "R$ 70.000,50" */
const money = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    if (typeof v === "number") return v;
    const cleaned = v.replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "Valor inválido." });
      return z.NEVER;
    }
    return n;
  });

const optText = (max = 500) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null));

const optUuid = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid().nullable());

/** datetime-local ("2026-09-27T14:00") no fuso de São Paulo → ISO */
export const optDateTime = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((v, ctx) => {
    if (!v) return null;
    const withTz = /[zZ]|[+-]\d\d:\d\d$/.test(v) ? v : `${v}${v.length === 16 ? ":00" : ""}-03:00`;
    const d = new Date(withTz);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: "custom", message: "Data inválida." });
      return z.NEVER;
    }
    return d.toISOString();
  });

export const leadSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  phone: optText(30),
  email: optText(160),
  source: optText(60),
  stage: z.enum(STAGE_VALUES).default("novo"),
  temperature: z
    .union([z.enum(TEMPERATURE_VALUES), z.literal(""), z.null(), z.undefined()])
    .transform((v) => (v ? v : null)),
  interest: optText(200),
  budget_max: money,
  payment_method: optText(60),
  trade_in: optText(200),
  purchase_timeframe: optText(60),
  next_action: optText(200),
  next_action_at: optDateTime,
  customer_id: optUuid,
  vehicle_id: optUuid,
  lost_reason: optText(300),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const customerSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(120),
  phone: optText(30),
  email: optText(160),
  document: optText(20),
  city: optText(80),
  notes: optText(2000),
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const contactSchema = z.object({
  type: z.enum(CONTACT_TYPE_VALUES),
  description: optText(2000),
  occurred_at: optDateTime,
});

export const noteSchema = z.object({ content: z.string().trim().min(1, "Escreva a nota.").max(4000) });

export { money, optText, optUuid };
