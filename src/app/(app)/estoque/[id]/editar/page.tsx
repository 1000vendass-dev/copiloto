import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { VehicleForm } from "@/features/inventory/components/vehicle-form";
import { getVehicle, listStores } from "@/features/inventory/queries";

export const metadata: Metadata = { title: "Editar veículo" };

export default async function EditarVeiculoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [data, stores] = await Promise.all([getVehicle(id), listStores()]);
  if (!data) notFound();
  const v = data.vehicle;
  return (
    <>
      <PageHeader title={`Editar: ${v.brand} ${v.model}`} actions={<Link href={`/estoque/${id}`} className="text-sm text-brand hover:underline">Voltar</Link>} />
      <Card><VehicleForm vehicle={v} features={data.features} stores={stores} /></Card>
    </>
  );
}
