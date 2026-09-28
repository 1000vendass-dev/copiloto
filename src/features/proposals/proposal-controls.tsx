"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { acceptProposalAndRegisterSale, deleteProposal, setProposalStatus } from "./actions";

export function ProposalControls({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (s: "rascunho" | "enviada" | "recusada" | "expirada") =>
    start(async () => { const r = await setProposalStatus(id, s); if (!r.ok) setError(r.error ?? "Erro"); });
  if (status === "aceita") return <p className="text-sm font-medium text-green-700">✅ Proposta aceita — venda registrada no lead e no veículo.</p>;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status !== "enviada" ? <Button variant="outline" disabled={pending} onClick={() => run("enviada")}>Marcar como enviada</Button> : null}
        {status !== "recusada" ? <Button variant="outline" disabled={pending} onClick={() => run("recusada")}>Recusada</Button> : null}
        {status !== "rascunho" ? <Button variant="ghost" disabled={pending} onClick={() => run("rascunho")}>Voltar para rascunho</Button> : null}
      </div>
      <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950">
        <p className="mb-2 text-sm">Cliente aceitou? Isso marca o lead como <strong>Venda</strong> e o veículo como <strong>Vendido</strong>.</p>
        <ConfirmButton label="Cliente aceitou — registrar venda" confirmLabel="Confirmar venda" variant="primary" size="md"
          onConfirm={() => acceptProposalAndRegisterSale(id)} />
      </div>
      <ConfirmButton label="Excluir proposta" confirmLabel="Excluir proposta" onConfirm={() => deleteProposal(id)} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
