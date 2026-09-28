import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardTitle, EmptyState } from "@/components/ui/card";
import { stageLabel } from "@/features/crm/constants";
import { ImageManager } from "@/features/inventory/components/image-manager";
import { DeleteVehicleButton, VehicleStatusControl } from "@/features/inventory/components/status-control";
import { bodyLabel, statusClass, statusLabel, transmissionLabel } from "@/features/inventory/constants";
import { getVehicle } from "@/features/inventory/queries";
import { getSession } from "@/lib/auth";
import { formatBRL, formatDate } from "@/lib/utils";

export const metadata: Metadata = { title: "Veículo" };

export default async function VeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [session, data] = await Promise.all([getSession(), getVehicle(id)]);
  if (!data) notFound();
  const { vehicle: v, images, features, leads } = data;

  const specs: [string, React.ReactNode][] = [
    ["Ano", v.year_manufacture && v.year_model ? `${v.year_manufacture}/${v.year_model}` : v.year_model],
    ["Km", v.km != null ? v.km.toLocaleString("pt-BR") : null],
    ["Câmbio", v.transmission ? transmissionLabel(v.transmission) : null],
    ["Combustível", v.fuel],
    ["Motor", v.engine],
    ["Carroceria", v.body_type ? bodyLabel(v.body_type) : null],
    ["Cor", v.color],
    ["Portas", v.doors],
    ["Placa", v.plate],
    ["Loja", v.store],
    ["Código", v.stock_code],
    ["Entrada", v.entry_date ? formatDate(v.entry_date) : null],
    ["Preço de compra", v.purchase_price ? formatBRL(v.purchase_price) : null],
  ];

  return (
    <>
      <PageHeader title={`${v.brand} ${v.model}`} subtitle={v.version ?? undefined}
        actions={<Link href={`/estoque/${v.id}/editar`}><Button variant="outline"><Pencil className="h-4 w-4" />Editar</Button></Link>} />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card><CardTitle className="mb-3">Fotos</CardTitle><ImageManager vehicleId={v.id} teamId={session.teamId} images={images} /></Card>
          <Card>
            <CardTitle className="mb-3">Opcionais</CardTitle>
            {features.length ? <div className="flex flex-wrap gap-1.5">{features.map((f) => <Badge key={f}>{f}</Badge>)}</div> : <EmptyState>Nenhum opcional cadastrado.</EmptyState>}
          </Card>
          {v.description ? <Card><CardTitle className="mb-2">Descrição</CardTitle><p className="whitespace-pre-line text-sm">{v.description}</p></Card> : null}
        </div>
        <div className="space-y-4">
          <Card className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold tabular-nums">{formatBRL(v.sale_price)}</span>
              <Badge className={statusClass(v.status)}>{statusLabel(v.status)}</Badge>
            </div>
            <VehicleStatusControl key={v.status} id={v.id} status={v.status} />
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              {specs.filter(([, val]) => val !== null && val !== undefined && val !== "").map(([k, val]) => (
                <div key={k}><dt className="text-xs text-fg-muted">{k}</dt><dd>{val}</dd></div>
              ))}
            </dl>
          </Card>
          <Card>
            <CardTitle className="mb-3">Leads interessados</CardTitle>
            {leads.length ? (
              <ul className="space-y-1 text-sm">
                {leads.map((l) => <li key={l.id}><Link href={`/leads/${l.id}`} className="text-brand hover:underline">{l.name}</Link> <span className="text-fg-muted">· {stageLabel(l.stage)}</span></li>)}
              </ul>
            ) : <EmptyState>Nenhum lead vinculado.</EmptyState>}
          </Card>
          <div className="flex justify-end"><DeleteVehicleButton id={v.id} /></div>
        </div>
      </div>
    </>
  );
}
