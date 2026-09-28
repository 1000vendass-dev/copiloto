"use client";

import { useState, useTransition } from "react";
import { Button, type ButtonProps } from "./button";

/**
 * Botão para ações de alto risco: exige segundo clique de confirmação.
 * (Não usa window.confirm — funciona igual no celular e no PWA.)
 */
export function ConfirmButton({
  onConfirm,
  label,
  confirmLabel = "Confirmar exclusão",
  variant = "outline",
  size = "sm",
}: {
  onConfirm: () => Promise<{ ok: boolean; error?: string } | void>;
  label: string;
  confirmLabel?: string;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
}) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!armed) {
    return (
      <Button type="button" variant={variant} size={size} onClick={() => setArmed(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="danger"
        size={size}
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await onConfirm();
            if (r && !r.ok) setError(r.error ?? "Não foi possível concluir.");
          })
        }
      >
        {pending ? "Aguarde…" : confirmLabel}
      </Button>
      <Button type="button" variant="ghost" size={size} onClick={() => { setArmed(false); setError(null); }}>
        Cancelar
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}
