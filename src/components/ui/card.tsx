import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Card de vidro. `relative focus-within:z-10`: o vidro cria uma camada própria, e sem isso uma lista aberta
 * dentro do card (busca de veículo, por exemplo) ficaria por baixo do card seguinte.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("glass relative rounded-3xl p-4 focus-within:z-10 sm:p-5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-[15px] font-semibold tracking-tight text-fg", className)} {...props} />;
}

export function EmptyState({ children }: { children?: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-fg-muted">{children ?? "Nenhum registro encontrado."}</p>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200",
    success: "border-green-200 bg-green-50 text-green-800 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("rounded-2xl border px-4 py-3 text-sm", styles)}>
      {children}
    </div>
  );
}
