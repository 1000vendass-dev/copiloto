import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MEDIA_BUCKET } from "@/lib/whatsapp/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Toca o áudio de uma mensagem no card. A leitura da mensagem passa pela sessão (RLS: só a equipe vê);
 * o arquivo vem do bucket privado com a chave do servidor. Responde a Range (o player do celular pede em pedaços).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new NextResponse(null, { status: 401 });
  const { data: msg } = await supabase.from("whatsapp_messages").select("media_path").eq("id", id).maybeSingle();
  if (!msg?.media_path) return new NextResponse(null, { status: 404 });

  const { data: file, error } = await createAdminClient().storage.from(MEDIA_BUCKET).download(msg.media_path);
  if (error || !file) return new NextResponse(null, { status: 404 });
  const buf = new Uint8Array(await file.arrayBuffer());
  const type = file.type || "audio/ogg";
  const headers = { "content-type": type, "accept-ranges": "bytes", "cache-control": "private, max-age=86400" };

  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const size = buf.length;
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new NextResponse(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    return new NextResponse(buf.slice(start, end + 1), {
      status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) },
    });
  }
  return new NextResponse(buf, { headers: { ...headers, "content-length": String(buf.length) } });
}
