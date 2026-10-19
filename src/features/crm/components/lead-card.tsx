import Link from "next/link";
import { Clock, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { whenShort } from "@/lib/dates";
import { cn, formatBRL, formatDateTime } from "@/lib/utils";
import type { Lead } from "@/types/db";
import { TEMPERATURES, stageColor, stageLabel } from "../constants";

/**
 * Card do lead, no jeito do WhatsApp: hora da última conversa no canto e bolinha verde com o nº de
 * mensagens não lidas (some quando você abre o card ou responde).
 */
export function LeadCard({ lead, compact = false, unread = 0 }: { lead: Lead; compact?: boolean; unread?: number }) {
  const temp = TEMPERATURES.find((t) => t.value === lead.temperature);
  const late = lead.next_action_at && lead.next_action_at < new Date().toISOString() && !["venda", "perdido"].includes(lead.stage);
  const hasUnread = unread > 0;
  return (
    <Link href={`/leads/${lead.id}`}
      className={cn("glass block rounded-3xl p-3.5 transition-transform active:scale-[0.99] hover:border-brand/50", hasUnread && "border-green-500/60")}>
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand/12 font-bold text-brand" aria-hidden>
          {lead.name.trim().charAt(0).toUpperCase() || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className={cn("truncate", hasUnread ? "font-bold" : "font-semibold")}>{lead.name}</div>
            {lead.last_contact_at ? (
              <span className={cn("shrink-0 text-xs tabular-nums", hasUnread ? "font-semibold text-green-600 dark:text-green-400" : "text-fg-muted")}>
                {whenShort(lead.last_contact_at)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate text-sm text-fg-muted">
              {lead.interest || lead.budget_max
                ? <>{lead.interest ?? "—"}{lead.budget_max ? ` · até ${formatBRL(lead.budget_max)}` : ""}</>
                : lead.phone ? <span className="inline-flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{lead.phone}</span> : null}
            </div>
            {hasUnread ? (
              <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-green-500 px-1.5 text-[11px] font-bold text-white"
                aria-label={`${unread} ${unread === 1 ? "mensagem nova" : "mensagens novas"}`}>
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      {!compact || lead.next_action_at || temp ? (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
          {!compact ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-fg">
              <span className={cn("h-2 w-2 rounded-full", stageColor(lead.stage))} aria-hidden />
              {stageLabel(lead.stage)}
            </span>
          ) : null}
          {temp ? <Badge className={temp.className}>{temp.label}</Badge> : null}
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
