import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { VehicleForm } from "@/features/inventory/components/vehicle-form";
import { listStores } from "@/features/inventory/queries";

export const metadata: Metadata = { title: "Novo veículo" };

export default async function NovoVeiculoPage() {
  const stores = await listStores();
  return (
    <>
      <PageHeader title="Novo veículo" subtitle="As fotos são adicionadas depois de salvar." />
      <Card><VehicleForm stores={stores} /></Card>
    </>
  );
}
