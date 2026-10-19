"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Janela flutuante: no celular sobe de baixo (bottom sheet), no computador fica centralizada.
 * Fecha no X, no Esc e tocando fora. Trava a rolagem da página enquanto está aberta.
 * Vai direto para o <body> (portal) para nunca ficar presa dentro de um card de vidro.
 */
export function Sheet({ open, onClose, title, children, className }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open, onClose]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center md:items-center md:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="Fechar" className="absolute inset-0 bg-black/45 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cn(
        "glass-float animate-sheet relative flex max-h-[90dvh] w-full flex-col rounded-t-[28px] md:max-w-lg md:rounded-[28px]",
        className,
      )}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-muted-2 md:hidden" aria-hidden />
        <div className="flex items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fechar" className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-fg-muted hover:bg-muted-2"><X className="h-5 w-5" /></button>
        </div>
        <div className="pb-safe min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 pt-2">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
