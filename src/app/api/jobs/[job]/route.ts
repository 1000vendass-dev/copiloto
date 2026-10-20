import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { tick } from "@/features/copilot/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const token = process.env.JOBS_TOKEN;
  if (!token || token.length < 32) return false;
  const given = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, ""));
  const want = Buffer.from(token);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** Entrada das rotinas automáticas. Só o relógio (copiloto-cron, pela rede interna) chama, com token secreto. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await params;
  if (job !== "tick") return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    return NextResponse.json({ ok: true, ...(await tick(createAdminClient())) });
  } catch (e) {
    console.error("[jobs/tick]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
