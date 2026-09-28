import "server-only";
import { createClient } from "@/lib/supabase/server";

export const PROPOSAL_STATUS = [
  { value: "rascunho", label: "Rascunho", className: "bg-muted text-fg-muted" },
  { value: "enviada", label: "Enviada", className: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200" },
  { value: "aceita", label: "Aceita", className: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200" },
  { value: "recusada", label: "Recusada", className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200" },
  { value: "expirada", label: "Expirada", className: "bg-zinc-100 text-zinc-600" },
] as const;

const SELECT = "*,leads(id,name,phone),vehicles(id,stock_code,brand,model,version,year_model,sale_price,status)";

export type ProposalRow = {
  id: string; status: string; vehicle_price: number | null; discount: number; down_payment: number; trade_in_description: string | null;
  trade_in_value: number; financed_amount: number; installments: number | null; installment_value: number | null; total: number;
  valid_until: string | null; notes: string | null; created_at: string; lead_id: string | null; vehicle_id: string | null; customer_id: string | null;
  leads: { id: string; name: string; phone: string | null } | null;
  vehicles: { id: string; stock_code: string | null; brand: string; model: string; version: string | null; year_model: number | null; sale_price: number | null; status: string } | null;
};

export async function listProposals(status?: string) {
  const supabase = await createClient();
  let q = supabase.from("proposals").select(SELECT).order("created_at", { ascending: false }).limit(300);
  if (status && PROPOSAL_STATUS.some((s) => s.value === status)) q = q.eq("status", status);
  const { data, error } = await q;
  return { proposals: (data ?? []) as unknown as ProposalRow[], error: error?.message ?? null };
}

export async function getProposal(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("proposals").select(SELECT).eq("id", id).maybeSingle();
  return data as unknown as ProposalRow | null;
}

export const vehicleLabel = (v: ProposalRow["vehicles"]) =>
  v ? `${v.stock_code ? v.stock_code + " · " : ""}${v.brand} ${v.model} ${v.version ?? ""} ${v.year_model ?? ""}`.replace(/\s+/g, " ").trim() : "";
