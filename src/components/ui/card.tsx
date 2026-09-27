import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-xl border border-border bg-surface p-4 shadow-sm", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-fg", className)} {...props} />;
}

export function EmptyState({ children }: { children?: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-fg-muted">{children ?? "Nenhum registro encontrado."}</p>;
}

export function Alert({ kind = "error", children }: { kind?: "error" | "success" | "info"; children: React.ReactNode }) {
  const styles = {
    error: "border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200",
    success: "border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200",
    info: "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200",
  }[kind];
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cn("rounded-lg border px-3 py-2 text-sm", styles)}>
      {children}
    </div>
  );
}
