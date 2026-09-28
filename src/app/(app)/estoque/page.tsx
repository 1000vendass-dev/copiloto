import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, SlidersHorizontal } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { VehicleCard } from "@/features/inventory/components/vehicle-card";
import { BODY_TYPES, SORTS, TRANSMISSIONS, VEHICLE_STATUS } from "@/features/inventory/constants";
import { describeQuery } from "@/features/inventory/parse-query";
import { buildQuery, listStores, primaryImageUrls, searchVehicles, type InventoryFilters } from "@/features/inventory/queries";

export const metadata: Metadata = { title: "Estoque" };

export default async function EstoquePage({ searchParams }: { searchParams: Promise<InventoryFilters> }) {
  const f = await searchParams;
  const query = buildQuery(f);
  const [{ vehicles, count, error }, stores] = await Promise.all([
    searchVehicles(query, { status: f.status || "disponivel", store: f.store || undefined, sort: f.sort }),
    listStores(),
  ]);
  const images = await primaryImageUrls(vehicles.map((v) => v.id));
  const chips = describeQuery(query);
  const advancedOpen = Boolean(f.body || f.transmission || f.pmin || f.pmax || f.ymin || f.ymax || f.store || (f.status && f.status !== "disponivel"));

  return (
    <>
      <PageHeader title="Estoque" subtitle={`${count} ${count === 1 ? "veículo" : "veículos"}`}
        actions={<Link href="/estoque/novo"><Button><Plus className="h-4 w-4" />Novo veículo</Button></Link>} />

      <form action="/estoque" className="mb-4 space-y-3">
        <div className="flex gap-2">
          <Input name="q" type="search" defaultValue={f.q} placeholder='Ex.: "onix até 80 mil", "SUV automático 2020"' />
          <Button type="submit" aria-label="Buscar"><Search className="h-4 w-4" /></Button>
        </div>
        <details open={advancedOpen} className="rounded-xl border border-border bg-surface p-3">
          <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium"><SlidersHorizontal className="h-4 w-4" />Filtros</summary>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Select name="status" defaultValue={f.status ?? "disponivel"} aria-label="Status">
              {VEHICLE_STATUS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              <option value="todos">Todos</option>
            </Select>
            <Select name="body" defaultValue={f.body ?? ""} aria-label="Carroceria">
              <option value="">Carroceria</option>{BODY_TYPES.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
            </Select>
            <Select name="transmission" defaultValue={f.transmission ?? ""} aria-label="Câmbio">
              <option value="">Câmbio</option>{TRANSMISSIONS.slice(0, 2).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
            <Select name="store" defaultValue={f.store ?? ""} aria-label="Loja">
              <option value="">Todas as lojas</option>{stores.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Input name="pmin" inputMode="numeric" placeholder="Preço mín." defaultValue={f.pmin} aria-label="Preço mínimo" />
            <Input name="pmax" inputMode="numeric" placeholder="Preço máx." defaultValue={f.pmax} aria-label="Preço máximo" />
            <Input name="ymin" inputMode="numeric" placeholder="Ano mín." defaultValue={f.ymin} aria-label="Ano mínimo" />
            <Input name="ymax" inputMode="numeric" placeholder="Ano máx." defaultValue={f.ymax} aria-label="Ano máximo" />
            <Select name="sort" defaultValue={f.sort ?? "recentes"} aria-label="Ordenar" className="col-span-2">
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Select>
            <div className="col-span-2 flex gap-2">
              <Button type="submit" className="flex-1">Aplicar</Button>
              <Link href="/estoque" className="flex-1"><Button type="button" variant="outline" className="w-full">Limpar</Button></Link>
            </div>
          </div>
        </details>
      </form>

      {chips.length ? <p className="mb-3 text-sm text-fg-muted">Filtrando: {chips.join(" · ")}</p> : null}
      {error ? <Alert>Não foi possível carregar o estoque. Tente recarregar.</Alert> : null}

      {vehicles.length ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {vehicles.map((v) => <VehicleCard key={v.id} v={v} img={images.get(v.id)} />)}
        </div>
      ) : <EmptyState>Nenhum veículo encontrado com esses filtros.</EmptyState>}
      {count > vehicles.length ? <p className="mt-3 text-center text-xs text-fg-muted">Mostrando {vehicles.length} de {count}. Refine a busca.</p> : null}
    </>
  );
}
