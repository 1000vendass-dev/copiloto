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
  return { id: messageId(data) };
}

/** Mensagem de voz. `convert` faz o WAHA converter (webm/mp4 do navegador) para ogg/opus do WhatsApp. */
export async function sendVoice(session: string, chatId: string, audio: Uint8Array, mimetype: string): Promise<{ id: string | null }> {
  const data = await waha("/api/sendVoice", {
    method: "POST",
    body: JSON.stringify({ session, chatId, convert: true, file: { mimetype, filename: "voz", data: Buffer.from(audio).toString("base64") } }),
  });
  return { id: messageId(data) };
}

/** Baixa um arquivo de mídia do WAHA (ele apaga os arquivos em ~3 min, por isso baixar na hora). */
export async function downloadWahaFile(url: string): Promise<{ bytes: Uint8Array; mimetype: string }> {
  const key = process.env.WAHA_API_KEY;
  if (!key) throw new Error("WAHA_API_KEY ausente.");
  const base = (process.env.WAHA_URL ?? "http://127.0.0.1:3031").replace(/\/$/, "");
  const path = new URL(url).pathname; // a URL vem com o host interno do WAHA ("localhost:3000")
  if (!path.startsWith("/api/files/")) throw new Error("URL de mídia inesperada.");
  const res = await fetch(`${base}${path}`, { headers: { "x-api-key": key }, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`WAHA respondeu ${res.status} ao baixar mídia`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mimetype: (res.headers.get("content-type") ?? "application/octet-stream").split(";")[0] };
}

function messageId(data: Record<string, unknown>): string | null {
  const rec = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : null);
  const raw = data.id as unknown;
  const candidates: unknown[] = [
    typeof raw === "string" ? raw : rec(raw)?._serialized ?? rec(raw)?.id,
    rec(data.key)?.id,
    rec(rec(data._data)?.key)?.id,
    rec(rec(data._data)?.id)?.id,
  ];
  return candidates.find((c): c is string => typeof c === "string" && c.length > 0) ?? null;
}

/** Nome do perfil do WhatsApp de um número, se o WAHA já conhece (quem já falou com o número do Copiloto). */
export async function lookupPushName(session: string, waId: string): Promise<string | null> {
  try {
    const map = await waha(`/api/${encodeURIComponent(session)}/lids/pn/${encodeURIComponent(`${waId}@c.us`)}`);
    const ids = [typeof map.lid === "string" ? map.lid : null, `${waId}@c.us`].filter((x): x is string => Boolean(x));
    for (const id of ids) {
      const c = await waha(`/api/contacts?contactId=${encodeURIComponent(id)}&session=${encodeURIComponent(session)}`).catch(() => null);
      const name = c && (typeof c.pushname === "string" ? c.pushname : typeof c.name === "string" ? c.name : null);
      if (name?.trim()) return name.trim().slice(0, 120);
    }
  } catch {
    // WAHA fora ou número desconhecido: segue sem nome
  }
  return null;
}
