/** Tipo do contato do WhatsApp (coluna whatsapp_contacts.categoria). Só "cliente" conta no funil e nas métricas. */
export const CONTACT_TYPES = [
  { value: "cliente", label: "Cliente" }, { value: "loja", label: "Loja" }, { value: "parceiro", label: "Parceiro" },
  { value: "proprio", label: "Próprio" }, { value: "spam", label: "Spam" },
] as const;
export type ContactType = (typeof CONTACT_TYPES)[number]["value"];
export const NOT_CUSTOMER_PREFIX = "Não é cliente: ";
