import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { OPEN_STAGES } from "@/features/crm/constants";
import { ProposalForm } from "@/features/proposals/proposal-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Nova proposta" };

export default async function NovaPropostaPage({ searchParams }: { searchParams: Promise<{ lead?: string }> }) {
  const { lead } = await searchParams;
  const supabase = await createClient();
  const { data: leads } = await supabase.from("leads").select("id,name,vehicle_id").in("stage", OPEN_STAGES).order("name").limit(1000);
  let vehicleInitial: { id: string; label: string; price: number | null } | null = null;
  const chosen = (leads ?? []).find((l) => l.id === lead);
  if (chosen?.vehicle_id) {
    const { data: v } = await supabase.from("vehicles").select("id,stock_code,brand,model,version,year_model,sale_price").eq("id", chosen.vehicle_id).maybeSingle();
    if (v) vehicleInitial = { id: v.id, label: `${v.stock_code ?? ""} · ${v.brand} ${v.model} ${v.version ?? ""} ${v.year_model ?? ""}`.trim(), price: v.sale_price };
  }
  return (
    <>
      <PageHeader title="Nova proposta" />
      <Card><ProposalForm leads={leads ?? []} defaultLeadId={lead} vehicleInitial={vehicleInitial} /></Card>
    </>
  );
}
