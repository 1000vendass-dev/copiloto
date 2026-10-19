"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Janela flutuante: no celular sobe de baixo (bottom sheet), no computador fica centralizada.
 * Fecha no X, no Esc e tocando fora. Trava a rolagem da página enquanto está aberta.
 */
export function Sheet({ open, onClose, title, children, className }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className={cn(
        "relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl bg-surface shadow-xl md:max-w-lg md:rounded-2xl",
        className,
      )}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-2 rounded-full p-2 text-fg-muted hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      </div>
    </div>
  );
}
