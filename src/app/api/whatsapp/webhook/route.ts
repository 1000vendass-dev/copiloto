import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { handleWahaEvent } from "@/lib/whatsapp/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Recebe eventos do WAHA. Autenticado por HMAC-SHA512 do corpo (cabeçalho X-Webhook-Hmac). */
export async function POST(req: Request) {
  const secret = process.env.WAHA_HMAC_SECRET;
  if (!secret) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const raw = await req.text();
  const received = Buffer.from(req.headers.get("x-webhook-hmac") ?? "", "hex");
  const expected = createHmac("sha512", secret).update(raw).digest();
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let evt: Record<string, unknown>;
  try {
    evt = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  try {
    const result = await handleWahaEvent(createAdminClient(), evt);
    if (result !== "ok" && result !== "ignored_event") console.warn("[whatsapp/webhook] não gravou:", result);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    console.error("[whatsapp/webhook]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "processing_failed" }, { status: 500 }); // WAHA tenta de novo
  }
}
