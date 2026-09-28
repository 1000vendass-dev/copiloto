import Link from "next/link";
import { Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";
import type { Lead } from "@/types/db";
import { TEMPERATURES, stageColor, stageLabel } from "../constants";

export function LeadCard({ lead, compact = false }: { lead: Lead; compact?: boolean }) {
  const temp = TEMPERATURES.find((t) => t.value === lead.temperature);
  const late = lead.next_action_at && lead.next_action_at < new Date().toISOString() && !["venda", "perdido"].includes(lead.stage);
  return (
    <Link href={`/leads/${lead.id}`} className="block rounded-xl border border-border bg-surface p-3 shadow-sm transition-colors hover:border-brand">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium">{lead.name}</div>
          {lead.interest || lead.budget_max ? (
            <div className="truncate text-sm text-fg-muted">
              {lead.interest ?? "—"}{lead.budget_max ? ` · até ${formatBRL(lead.budget_max)}` : ""}
            </div>
          ) : null}
        </div>
        {temp ? <Badge className={temp.className}>{temp.label}</Badge> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        {!compact ? (
          <span className="inline-flex items-center gap-1">
            <span className={cn("h-2 w-2 rounded-full", stageColor(lead.stage))} />
            {stageLabel(lead.stage)}
          </span>
        ) : null}
        {lead.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{lead.phone}</span> : null}
        {lead.next_action_at ? (
          <span className={cn(late && "font-medium text-red-600")}>
            {late ? "Atrasado: " : "Próx.: "}{formatDateTime(lead.next_action_at)}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
