/* eslint-disable @next/next/no-img-element -- URLs assinadas do Supabase; next/image não agrega aqui */
import Link from "next/link";
import { Car } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatBRL } from "@/lib/utils";
import type { Vehicle } from "@/types/db";
import { statusClass, statusLabel, transmissionLabel } from "../constants";

export function VehicleCard({ v, img }: { v: Vehicle; img?: string }) {
  return (
    <Link href={`/estoque/${v.id}`} className="group flex overflow-hidden rounded-xl border border-border bg-surface shadow-sm transition-colors hover:border-brand sm:block">
      <div className="relative aspect-[4/3] w-32 shrink-0 bg-muted sm:w-full">
        {img ? (
          <img src={img} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-fg-muted"><Car className="h-8 w-8" aria-hidden /></div>
        )}
        {v.status !== "disponivel" ? <Badge className={`absolute left-2 top-2 ${statusClass(v.status)}`}>{statusLabel(v.status)}</Badge> : null}
      </div>
      <div className="min-w-0 flex-1 p-3">
        <div className="truncate text-sm font-semibold">{v.brand} {v.model}</div>
        <div className="truncate text-xs text-fg-muted">{v.version ?? "—"}</div>
        <div className="mt-1 text-xs text-fg-muted">
          {[v.year_manufacture && v.year_model ? `${v.year_manufacture}/${v.year_model}` : v.year_model,
            v.km != null ? `${v.km.toLocaleString("pt-BR")} km` : null,
            v.category === "moto" ? null : transmissionLabel(v.transmission)].filter(Boolean).join(" · ")}
        </div>
        <div className="mt-2 flex items-end justify-between">
          <span className="text-base font-bold tabular-nums">{formatBRL(v.sale_price)}</span>
          <span className="text-[11px] text-fg-muted">{v.stock_code}{v.store ? ` · ${v.store}` : ""}</span>
        </div>
      </div>
    </Link>
  );
}
