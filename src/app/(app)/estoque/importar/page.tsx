import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ImportWizard } from "@/features/inventory/import/import-wizard";

export const metadata: Metadata = { title: "Importar estoque" };

export default function ImportarPage() {
  return (
    <>
      <PageHeader title="Importar estoque" subtitle="CSV ou Excel · nada é sobrescrito sem você confirmar" />
      <ImportWizard />
    </>
  );
}
