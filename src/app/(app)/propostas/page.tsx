import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState } from "@/components/ui/card";
import { PROPOSAL_STATUS, listProposals, vehicleLabel } from "@/features/proposals/queries";
import { cn, formatBRL, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Propostas" };

export default async function PropostasPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const { proposals, error } = await listProposals(status);
  const chip = (a: boolean) => cn("whitespace-nowrap rounded-full border px-3 py-1 text-sm", a ? "border-brand bg-brand text-white" : "border-border bg-surface text-fg-muted");
  return (
    <>
      <PageHeader title="Propostas" subtitle={`${proposals.length} propostas`} actions={<Link href="/propostas/nova"><Button><Plus className="h-4 w-4" />Nova proposta</Button></Link>} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        <Link href="/propostas" className={chip(!status)}>Todas</Link>
        {PROPOSAL_STATUS.map((s) => <Link key={s.value} href={`/propostas?status=${s.value}`} className={chip(status === s.value)}>{s.label}</Link>)}
      </div>
      {error ? <Alert>Não foi possível carregar as propostas.</Alert> : null}
      {proposals.length ? (
        <Card className="divide-y divide-border p-0">
          {proposals.map((p) => {
            const st = PROPOSAL_STATUS.find((s) => s.value === p.status);
            return (
              <Link key={p.id} href={`/propostas/${p.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                <div className="min-w-0">
                  <div className="truncate font-medium">{p.leads?.name ?? "—"}</div>
                  <div className="truncate text-xs text-fg-muted">{vehicleLabel(p.vehicles)} · {formatDate(p.created_at)}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums">{formatBRL(p.total)}</div>
                  {st ? <Badge className={st.className}>{st.label}</Badge> : null}
                </div>
              </Link>
            );
          })}
        </Card>
      ) : <EmptyState />}
    </>
  );
}
