export const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** Telefone digitado no CRM → número do WhatsApp (DDI 55 se vier só com DDD). */
export function toWaId(phone: string | null | undefined): string | null {
  let d = onlyDigits(phone);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}

/** Compara pelos 8 últimos dígitos (tolera DDI, DDD e o 9º dígito). */
export const sameNumber = (a: string, b: string) => a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8);

/** "true_5519...@c.us_3EB0ABC" → "3EB0ABC" (mesmo id no webhook e no retorno do envio). */
export function shortId(id: string): string {
  const i = id.lastIndexOf("_");
  return i >= 0 ? id.slice(i + 1) : id;
}
