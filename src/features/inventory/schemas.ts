import { z } from "zod";
import { money, optText } from "@/features/crm/schemas";

const optInt = (min: number, max: number) =>
  z.union([z.string(), z.number(), z.null(), z.undefined()]).transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", "."));
    if (!Number.isInteger(n) || n < min || n > max) {
      ctx.addIssue({ code: "custom", message: "Número inválido." });
      return z.NEVER;
    }
    return n;
  });

export const vehicleSchema = z.object({
  stock_code: optText(20),
  category: z.enum(["carro", "moto", "utilitario", "caminhao", "outro"]).default("carro"),
  brand: z.string().trim().min(1, "Informe a marca.").max(60),
  model: z.string().trim().min(1, "Informe o modelo.").max(80),
  version: optText(120),
  year_manufacture: optInt(1900, 2100),
  year_model: optInt(1900, 2100),
  km: optInt(0, 3_000_000),
  color: optText(40),
  fuel: optText(30),
  transmission: optText(30),
  engine: optText(30),
  doors: optInt(0, 9),
  body_type: optText(30),
  plate: z.union([z.string(), z.null(), z.undefined()]).transform((v) => (v ? v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || null : null)),
  purchase_price: money,
  sale_price: money,
  status: z.enum(["disponivel", "reservado", "vendido", "inativo"]).default("disponivel"),
  store: optText(60),
  description: optText(4000),
});
export type VehicleInput = z.infer<typeof vehicleSchema>;
