/**
 * Lead sem nome: cadastra como "Sem nome · (19) 99105-4436" e o sistema troca pelo nome real
 * assim que descobrir (perfil do WhatsApp na 1ª mensagem, contato do WAHA ou a IA lendo a conversa).
 */

export const NO_NAME = "Sem nome";

/** (19) 99105-4436 a partir de qualquer formato (com ou sem 55). */
export function formatPhoneBR(phone: string | null | undefined): string {
  let d = (phone ?? "").replace(/\D/g, "");
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone?.trim() ?? "";
}

export function placeholderName(phone: string | null | undefined): string {
  const p = formatPhoneBR(phone);
  return p ? `${NO_NAME} · ${p}` : NO_NAME;
}

/** Nome provisório: vazio, "Sem nome…" ou só um telefone (como os leads criados pelo WhatsApp sem perfil). */
export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? "").trim();
  return !n || /^sem nome\b/i.test(n) || /^\+?[\d\s().-]{8,}$/.test(n);
}
