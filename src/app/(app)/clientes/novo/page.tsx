import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { CustomerForm } from "@/features/crm/components/customer-form";

export const metadata: Metadata = { title: "Novo cliente" };

export default function NovoClientePage() {
  return (
    <>
      <PageHeader title="Novo cliente" />
      <Card><CustomerForm /></Card>
    </>
  );
}
