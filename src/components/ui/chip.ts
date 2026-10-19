import { cn } from "@/lib/utils";

/** Filtro em pílula (Leads, Tarefas, Propostas...). Ativo = azul; inativo = vidro. */
export const chipClass = (active: boolean, className?: string) => cn(
  "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-4 text-sm font-medium transition-colors",
  active ? "bg-brand text-white shadow-[0_6px_16px_-8px] shadow-brand/70" : "glass text-fg-muted hover:text-fg",
  className,
);
