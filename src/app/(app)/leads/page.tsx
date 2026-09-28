import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LeadCard } from "@/features/crm/components/lead-card";
import { STAGES, TEMPERATURES } from "@/features/crm/constants";
import { listLeads } from "@/features/crm/queries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Leads" };

type SP = { q?: string; stage?: string; temperature?: string; view?: string };

function href(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  const merged = { ...sp, ...patch };
  (Object.keys(merged) as (keyof SP)[]).forEach((k) => { if (merged[k]) p.set(k, merged[k]!); });
  const s = p.toString();
  return `/leads${s ? `?${s}` : ""}`;
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = sp.view === "funil" ? "funil" : "lista";
  const { leads, error } = await listLeads(sp);

  const chip = (active: boolean) =>
    cn("whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium",
      active ? "border-brand bg-brand text-white" : "border-border bg-surface text-fg-muted hover:text-fg");

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} ${leads.length === 1 ? "lead" : "leads"}`}
        actions={<Link href="/leads/novo"><Button><Plus className="h-4 w-4" />Novo lead</Button></Link>}
      />

      <form className="mb-3 flex gap-2" action="/leads">
        {sp.stage ? <input type="hidden" name="stage" value={sp.stage} /> : null}
        {sp.temperature ? <input type="hidden" name="temperature" value={sp.temperature} /> : null}
        {view === "funil" ? <input type="hidden" name="view" value="funil" /> : null}
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por nome, telefone, interesse…" type="search" />
        <Button type="submit" variant="outline" aria-label="Buscar"><Search className="h-4 w-4" /></Button>
      </form>

      <div className="mb-3 flex gap-2">
        <Link href={href(sp, { view: undefined })} className={chip(view === "lista")}>Lista</Link>
        <Link href={href(sp, { view: "funil", stage: undefined })} className={chip(view === "funil")}>Funil</Link>
        <span className="mx-1 w-px bg-border" />
        {TEMPERATURES.map((t) => (
          <Link key={t.value} href={href(sp, { temperature: sp.temperature === t.value ? undefined : t.value })} className={chip(sp.temperature === t.value)}>
            {t.label}
          </Link>
        ))}
      </div>

      {view === "lista" ? (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Link href={href(sp, { stage: undefined })} className={chip(!sp.stage)}>Em aberto</Link>
          {STAGES.map((s) => (
            <Link key={s.value} href={href(sp, { stage: s.value })} className={chip(sp.stage === s.value)}>{s.label}</Link>
          ))}
          <Link href={href(sp, { stage: "todos" })} className={chip(sp.stage === "todos")}>Todos</Link>
        </div>
      ) : null}

      {error ? <Alert>Não foi possível carregar os leads. Tente recarregar.</Alert> : null}

      {view === "lista" ? (
        leads.length ? (
          <div className="grid gap-2 md:grid-cols-2">{leads.map((l) => <LeadCard key={l.id} lead={l} />)}</div>
        ) : (
          <EmptyState />
        )
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
          {STAGES.map((s) => {
            const items = leads.filter((l) => l.stage === s.value);
            return (
              <section key={s.value} className="w-72 shrink-0 snap-start rounded-xl bg-muted p-2">
                <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                  <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", s.color)} />{s.label}</span>
                  <span className="text-fg-muted">{items.length}</span>
                </h2>
                <div className="space-y-2">
                  {items.map((l) => <LeadCard key={l.id} lead={l} compact />)}
                  {!items.length ? <p className="px-1 py-3 text-xs text-fg-muted">Vazio</p> : null}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
