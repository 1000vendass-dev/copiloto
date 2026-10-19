import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Mídia do WhatsApp: o arquivo vai para o Storage (bucket privado) para o vendedor ver/ouvir no card.
 * Áudio também vira texto (Whisper na VPS) em whatsapp_messages.transcript, só para a IA.
 */

export const MEDIA_BUCKET = "whatsapp-media";

const EXT: Record<string, string> = {
  "audio/ogg": "ogg", "audio/webm": "webm", "audio/mp4": "m4a", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/wav": "wav",
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic",
  "video/mp4": "mp4", "video/3gpp": "3gp", "application/pdf": "pdf",
};
const baseType = (mimetype: string) => mimetype.split(";")[0].trim().toLowerCase();

/** Fala → texto. Devolve null se o serviço estiver fora (o áudio continua salvo; dá para transcrever depois). */
export async function transcribeAudio(bytes: Uint8Array, mimetype: string): Promise<string | null> {
  const base = (process.env.WHISPER_URL ?? "http://copiloto-whisper:9000").replace(/\/$/, "");
  const form = new FormData();
  form.append("audio_file", new Blob([new Uint8Array(bytes)], { type: baseType(mimetype) }), `audio.${EXT[baseType(mimetype)] ?? "bin"}`);
  const res = await fetch(`${base}/asr?task=transcribe&language=pt&output=txt&vad_filter=true&encode=true`, {
    method: "POST", body: form, signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Whisper respondeu ${res.status}`);
  return (await res.text()).trim() || null;
}

type Msg = { id: string; teamId: string };

/** Guarda o arquivo (áudio, foto, vídeo, documento) no Storage e marca media_path. Nunca lança. */
export async function saveMedia(admin: SupabaseClient, msg: Msg, bytes: Uint8Array, mimetype: string): Promise<void> {
  const type = baseType(mimetype);
  try {
    const path = `${msg.teamId}/${msg.id}.${EXT[type] ?? "bin"}`;
    const up = await admin.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: type, upsert: true });
    if (up.error) throw new Error(`Storage: ${up.error.message}`);
    await admin.from("whatsapp_messages").update({ media_path: path }).eq("id", msg.id);
  } catch (e) {
    console.error("[whatsapp/media] salvar:", e instanceof Error ? e.message : e);
  }
}

export const saveAudio = saveMedia;

/** Transcreve e grava em transcript (só para a IA). Nunca lança. */
export async function transcribeMessage(admin: SupabaseClient, msg: Msg, bytes: Uint8Array, mimetype: string): Promise<void> {
  try {
    const text = await transcribeAudio(bytes, mimetype);
    if (text) await admin.from("whatsapp_messages").update({ transcript: text }).eq("id", msg.id);
  } catch (e) {
    console.error("[whatsapp/audio] transcrever:", e instanceof Error ? e.message : e);
  }
}

/** Guarda e transcreve (webhook, em segundo plano). */
export async function processAudio(admin: SupabaseClient, msg: Msg, bytes: Uint8Array, mimetype: string): Promise<void> {
  await saveMedia(admin, msg, bytes, mimetype);
  await transcribeMessage(admin, msg, bytes, mimetype);
}
