import { CalendarClock, CheckCircle2, FileText, Flag, MessageCircle, Phone, Sparkles, StickyNote, UserPlus, XCircle, Car, Mail, ArrowRightLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";
import type { Activity } from "@/types/db";
import { ACTIVITY_LABELS } from "../constants";

const ICONS: Record<string, typeof Phone> = {
  ligacao: Phone, whatsapp: MessageCircle, email: Mail, visita: Car, test_drive: Car, proposta: FileText,
  follow_up: CalendarClock, mudanca_etapa: ArrowRightLeft, lead_criado: UserPlus, cliente_criado: UserPlus,
  tarefa_criada: CalendarClock, tarefa_concluida: CheckCircle2, compromisso_criado: CalendarClock,
  nota: StickyNote, venda: Flag, perda: XCircle, ia: Sparkles,
};

export function Timeline({ items }: { items: Activity[] }) {
  if (!items.length) return <EmptyState>Nenhuma atividade registrada ainda.</EmptyState>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((a) => {
        const Icon = ICONS[a.type] ?? FileText;
        return (
          <li key={a.id} className="relative">
            <span className="absolute -left-[31px] flex h-6 w-6 items-center justify-center rounded-full border border-border bg-surface">
              <Icon className="h-3.5 w-3.5 text-fg-muted" aria-hidden />
            </span>
            <div className="text-xs text-fg-muted">
              {formatDateTime(a.occurred_at)} · {ACTIVITY_LABELS[a.type] ?? a.type}
            </div>
            <div className="text-sm font-medium">{a.title}</div>
            {a.description ? <p className="whitespace-pre-line text-sm text-fg-muted">{a.description}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}
