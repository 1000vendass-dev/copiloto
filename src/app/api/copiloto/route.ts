import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { CopilotoUnavailable, isConfirmation, runCopiloto, systemPrompt, type ChatMessage } from "@/features/ai/agent";
import { listStores } from "@/features/inventory/queries";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from("profiles").select("full_name, default_team_id").eq("id", user.id).maybeSingle(),
    supabase.from("team_members").select("team_id, teams(name)").eq("user_id", user.id),
  ]);
  const m = (memberships ?? []).find((x) => x.team_id === profile?.default_team_id) ?? memberships?.[0];
  if (!m) return null;
  return { supabase, userId: user.id, userName: profile?.full_name ?? user.email ?? "vendedor", teamId: m.team_id as string, teamName: (m.teams as unknown as { name: string } | null)?.name ?? "" };
}

export async function GET() {
  const c = await context();
  if (!c) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });
  const { data } = await c.supabase.from("ai_messages").select("id,role,content,meta,created_at")
    .eq("user_id", c.userId).order("created_at", { ascending: false }).limit(40);
  return NextResponse.json({ messages: (data ?? []).reverse(), configured: Boolean(process.env.ANTHROPIC_API_KEY) });
}

export async function DELETE() {
  const c = await context();
  if (!c) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  await c.supabase.from("ai_messages").delete().eq("user_id", c.userId);
  return NextResponse.json({ ok: true });
}

const bodySchema = z.object({ message: z.string().trim().min(1).max(2000) });

export async function POST(req: NextRequest) {
  const c = await context();
  if (!c) return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Mensagem vazia ou longa demais." }, { status: 400 });
  const text = parsed.data.message;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "O Copiloto ainda não está ativado: falta configurar a chave da IA (ANTHROPIC_API_KEY) na Vercel." }, { status: 503 });
  }

  // histórico curto (só texto): o contexto de negócio vem do banco via ferramentas, não do chat
  const [{ data: hist }, { data: mems }, stores] = await Promise.all([
    c.supabase.from("ai_messages").select("role,content").eq("user_id", c.userId).order("created_at", { ascending: false }).limit(6),
    c.supabase.from("ai_memory").select("content").in("scope", ["geral", "preferencia"]).order("importance", { ascending: false }).limit(15),
    listStores(),
  ]);
  const history: ChatMessage[] = (hist ?? []).reverse().map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));
  while (history.length && history[0].role !== "user") history.shift();
  // a API exige alternância user/assistant
  const clean: ChatMessage[] = [];
  for (const m of history) { if (clean.length && clean[clean.length - 1].role === m.role) clean.pop(); clean.push(m); }
  if (clean.length && clean[clean.length - 1].role === "user") clean.pop();

  await c.supabase.from("ai_messages").insert({ team_id: c.teamId, user_id: c.userId, role: "user", content: text });

  try {
    const { reply, actions, usage } = await runCopiloto({
      apiKey,
      model: process.env.COPILOTO_MODEL || "claude-sonnet-5",
      system: systemPrompt({ userName: c.userName, teamName: c.teamName, stores, memories: (mems ?? []).map((m) => m.content) }),
      history: clean,
      userText: text,
      ctx: { supabase: c.supabase, userId: c.userId, teamId: c.teamId, userConfirmed: isConfirmation(text), origin: req.nextUrl.origin },
    });
    const { data: saved } = await c.supabase.from("ai_messages")
      .insert({ team_id: c.teamId, user_id: c.userId, role: "assistant", content: reply, meta: { actions, usage } })
      .select("id,role,content,meta,created_at").single();
    return NextResponse.json({ message: saved ?? { role: "assistant", content: reply, meta: { actions } } });
  } catch (e) {
    const msg = e instanceof CopilotoUnavailable ? e.message
      : e instanceof Error && e.name === "TimeoutError" ? "A IA demorou demais para responder. Tente de novo."
      : "Não consegui processar agora. Seus dados não foram alterados além do que já foi confirmado acima.";
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
