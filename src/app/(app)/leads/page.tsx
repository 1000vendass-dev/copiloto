import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/card";
import { chipClass } from "@/components/ui/chip";
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
  const view = sp.view === "lista" ? "lista" : "funil"; // funil é o padrão
  const { leads, unread, error } = await listLeads(sp);
  const unreadTotal = Object.keys(unread).length;

  const chip = (active: boolean) => chipClass(active);

  return (
    <>
      <PageHeader
        title="Leads"
        subtitle={`${leads.length} ${leads.length === 1 ? "lead" : "leads"}${unreadTotal ? ` · ${unreadTotal} com mensagem nova` : ""}`}
        actions={<Link href="/leads/novo"><Button><Plus className="h-4 w-4" />Novo lead</Button></Link>}
      />

      <form className="mb-3 flex gap-2" action="/leads">
        {sp.stage ? <input type="hidden" name="stage" value={sp.stage} /> : null}
        {sp.temperature ? <input type="hidden" name="temperature" value={sp.temperature} /> : null}
        {view === "lista" ? <input type="hidden" name="view" value="lista" /> : null}
        <Input name="q" defaultValue={sp.q} placeholder="Buscar por nome, telefone, interesse…" type="search" />
        <Button type="submit" variant="outline" aria-label="Buscar"><Search className="h-4 w-4" /></Button>
      </form>

      <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
        <Link href={href(sp, { view: undefined, stage: undefined })} className={chip(view === "funil")}>Funil</Link>
        <Link href={href(sp, { view: "lista" })} className={chip(view === "lista")}>Lista</Link>
        <span className="mx-1 w-px bg-border" />
        {TEMPERATURES.map((t) => (
          <Link key={t.value} href={href(sp, { temperature: sp.temperature === t.value ? undefined : t.value })} className={chip(sp.temperature === t.value)}>
            {t.label}
          </Link>
        ))}
      </div>

      {view === "lista" ? (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
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
          <div className="grid gap-2 md:grid-cols-2">{leads.map((l) => <LeadCard key={l.id} lead={l} unread={unread[l.id]} />)}</div>
        ) : (
          <EmptyState />
        )
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4">
          {STAGES.map((s) => {
            const items = leads.filter((l) => l.stage === s.value);
            const news = items.filter((l) => unread[l.id]).length;
            return (
              <section key={s.value} className="glass w-72 shrink-0 snap-start rounded-3xl p-2.5">
                <h2 className="flex items-center justify-between px-1 pb-2 text-sm font-semibold">
                  <span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", s.color)} />{s.label}</span>
                  <span className="flex items-center gap-1.5">
                    {news ? <span className="rounded-full bg-green-500 px-2 py-0.5 text-[11px] font-bold text-white" title="Com mensagem nova">{news}</span> : null}
                    <span className="text-fg-muted">{items.length}</span>
                  </span>
                </h2>
                <div className="space-y-2">
                  {items.map((l) => <LeadCard key={l.id} lead={l} unread={unread[l.id]} compact />)}
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
