import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { IaMemory, type MemoryRow } from "@/features/copilot/components/ia-memory";
import { IaProfileForm } from "@/features/copilot/components/ia-profile-form";
import { IaRuns, type RunRow } from "@/features/copilot/components/ia-runs";
import { ensureProfile } from "@/features/copilot/profile";
import { getSession } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Minha IA" };
export const dynamic = "force-dynamic";

/** Aba IA: cada usuário configura a SUA IA (identidade, personalidade, autonomia, rotinas, memória). */
export default async function IaPage() {
  const session = await getSession();
  const supabase = await createClient();
  const profile = await ensureProfile(createAdminClient(), session.userId, session.teamId);

  const [{ data: runs }, { data: mem }, { count: clientFacts }] = await Promise.all([
    supabase.from("copilot_runs").select("id,job,status,trigger,started_at,finished_at,error,stats").order("started_at", { ascending: false }).limit(8),
    supabase.from("ai_memory").select("id,scope,content,status,source").in("scope", ["loja", "vendedor", "preferencia", "padrao", "geral"])
      .neq("status", "arquivada").order("status").order("importance", { ascending: false }).limit(60),
    supabase.from("ai_memory").select("id", { count: "exact", head: true }).eq("scope", "cliente").eq("status", "ativa"),
  ]);

  return (
    <>
      <PageHeader title="Minha IA" subtitle={`${profile.config.identity.emoji} ${profile.config.identity.name}: configure como ela pensa, fala e trabalha`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <IaProfileForm initial={{ autonomy: profile.autonomy, config: profile.config }} />
        <div className="space-y-4">
          <IaRuns runs={(runs ?? []) as RunRow[]} />
          <IaMemory items={(mem ?? []) as MemoryRow[]} clientCount={clientFacts ?? 0} />
        </div>
      </div>
    </>
  );
}
