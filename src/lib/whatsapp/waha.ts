import "server-only";

/** Cliente mínimo do WAHA (API HTTP do WhatsApp). Só servidor. */

export const wahaSession = () => process.env.WAHA_SESSION ?? "default";

async function waha(path: string, init?: RequestInit) {
  const key = process.env.WAHA_API_KEY;
  if (!key) throw new Error("WAHA_API_KEY ausente. Veja .env.example.");
  const base = (process.env.WAHA_URL ?? "http://127.0.0.1:3031").replace(/\/$/, "");
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "x-api-key": key, ...init?.headers },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`WAHA respondeu ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

/** Contatos novos chegam como @lid; o WAHA sabe o telefone real. */
export async function resolveLid(session: string, lid: string): Promise<string | null> {
  try {
    const data = await waha(`/api/${encodeURIComponent(session)}/lids/${encodeURIComponent(lid)}`);
    return typeof data.pn === "string" && data.pn ? data.pn : null;
  } catch {
    return null;
  }
}

export async function sendText(session: string, chatId: string, text: string): Promise<{ id: string | null }> {
  const data = await waha("/api/sendText", { method: "POST", body: JSON.stringify({ session, chatId, text }) });
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  const raw = data.id as unknown;
  const candidates: unknown[] = [
    typeof raw === "string" ? raw : rec(raw)?._serialized ?? rec(raw)?.id,
    rec(data.key)?.id,
    rec(rec(data._data)?.key)?.id,
    rec(rec(data._data)?.id)?.id,
  ];
  const id = candidates.find((c): c is string => typeof c === "string" && c.length > 0) ?? null;
  return { id };
}
