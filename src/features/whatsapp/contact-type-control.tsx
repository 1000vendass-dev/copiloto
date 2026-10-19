"use client";

import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { setContactType } from "./actions";
import { CONTACT_TYPES } from "./contact-types";

/** Tipo do contato do WhatsApp. Escolher algo diferente de Cliente tira o lead do funil (Perdido). */
export function ContactTypeControl({ leadId, value }: { leadId: string; value: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-1 text-xs text-fg-muted">Tipo de contato</div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo de contato">
        {CONTACT_TYPES.map((t) => (
          <button
            key={t.value}
            type="button"
            disabled={pending || value === t.value}
            onClick={() => start(async () => { const r = await setContactType(leadId, t.value); setError(r.ok ? null : r.error ?? "Erro"); })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium",
              value === t.value ? "border-brand bg-brand text-white" : "border-border text-fg-muted hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
