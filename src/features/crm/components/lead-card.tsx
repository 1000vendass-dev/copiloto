import Link from "next/link";
import { Clock, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";
import type { Lead } from "@/types/db";
import { TEMPERATURES, stageColor, stageLabel } from "../constants";

export function LeadCard({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const temp = TEMPERATURES.find((t) => t.value === lead.temperature);
  const late = lead.next_action_at && lead.next_action_at < new Date().toISOString() && !["venda", "perdido"].includes(lead.stage);
  return (
    <Link href={`/leads/${lead.id}`} className="glass block rounded-3xl p-3.5 transition-transform active:scale-[0.99] hover:border-brand/50">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/12 font-bold text-brand" aria-hidden>
          {lead.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="truncate font-semibold">{lead.name}</div>
            {temp ? <Badge className={temp.className}>{temp.label}</Badge> : null}
          </div>
          {lead.interest || lead.budget_max ? (
            <div className="truncate text-sm text-fg-muted">
              {lead.interest ?? "—"}{lead.budget_max ? ` · até ${formatBRL(lead.budget_max)}` : ""}
            </div>
          ) : lead.phone ? (
            <div className="flex items-center gap-1 truncate text-sm text-fg-muted"><Phone className="h-3.5 w-3.5" aria-hidden />{lead.phone}</div>
          ) : null}
        </div>
      </div>
      {!compact || lead.next_action_at ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
          {!compact ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-fg">
              <span className={cn("h-2 w-2 rounded-full", stageColor(lead.stage))} aria-hidden />
              {stageLabel(lead.stage)}
            </span>
          ) : null}
          {lead.next_action_at ? (
            <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
              late ? "bg-red-500/12 text-red-600 dark:text-red-400" : "bg-muted text-fg-muted")}>
              <Clock className="h-3 w-3" aria-hidden />{late ? "Atrasado · " : ""}{formatDateTime(lead.next_action_at)}
            </span>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
