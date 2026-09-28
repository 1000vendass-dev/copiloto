import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { listCustomers } from "@/features/crm/queries";

export const metadata: Metadata = { title: "Clientes" };

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const { customers, error } = await listCustomers(q);
  return (
    <>
      <PageHeader title="Clientes" subtitle={`${customers.length} cadastrados`}
        actions={<Link href="/clientes/novo"><Button><Plus className="h-4 w-4" />Novo cliente</Button></Link>} />
      <form className="mb-4 flex gap-2" action="/clientes">
        <Input name="q" defaultValue={q} type="search" placeholder="Buscar por nome, telefone, cidade…" />
        <Button type="submit" variant="outline" aria-label="Buscar"><Search className="h-4 w-4" /></Button>
      </form>
      {error ? <Alert>Não foi possível carregar os clientes.</Alert> : null}
      {customers.length ? (
        <Card className="divide-y divide-border p-0">
          {customers.map((c) => (
            <Link key={c.id} href={`/clientes/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="truncate text-xs text-fg-muted">{[c.phone, c.city].filter(Boolean).join(" · ") || "—"}</div>
              </div>
            </Link>
          ))}
        </Card>
      ) : <EmptyState />}
    </>
  );
}
