"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { ArrowLeft, CalendarPlus, CheckSquare, MessageCircle, NotebookPen, Phone, PhoneCall, Plus, Sparkles, Tag, UserRound } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { CopilotoChat } from "@/features/ai/chat";
import { cn } from "@/lib/utils";

type Panel = "notas" | "tarefas" | "contato" | "tags";
type Open = Panel | "perfil" | "ia" | null;

const PANELS: { key: Panel; label: string; icon: typeof Plus }[] = [
  { key: "notas", label: "Notas", icon: NotebookPen },
  { key: "tarefas", label: "Follow-ups e tarefas", icon: CheckSquare },
  { key: "contato", label: "Registrar contato", icon: PhoneCall },
  { key: "tags", label: "Tags", icon: Tag },
];

const iconBtn = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg-muted hover:bg-muted active:bg-muted-2";

/**
 * Card do lead no formato do WhatsApp: conversa em tela cheia, perfil e atalhos no topo,
 * botão + com notas/tarefas/contato/tags e botão da IA, cada um abrindo uma janela flutuante.
 * O conteúdo de cada janela vem pronto do servidor (props), aqui só se controla o que está aberto.
 */
export function LeadWorkspace({ lead, telHref, waHref, chat, profile, panels }: {
  lead: { id: string; name: string; subtitle: string | null };
  telHref: string | null;
  waHref: string | null;
  chat: React.ReactNode;
  profile: React.ReactNode;
  panels: Record<Panel, React.ReactNode>;
}) {
  const [open, setOpen] = useState<Open>(null);
  const [menu, setMenu] = useState(false);
  const close = useCallback(() => setOpen(null), []);
  const pick = (p: Open) => { setMenu(false); setOpen(p); };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg md:relative md:inset-auto md:z-auto md:h-[calc(100dvh-4.5rem)] md:overflow-hidden md:rounded-xl md:border md:border-border">
      <header className="flex items-center gap-0.5 border-b border-border bg-surface px-1 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]">
        <Link href="/leads" aria-label="Voltar para leads" className={iconBtn}><ArrowLeft className="h-5 w-5" /></Link>
        <button type="button" onClick={() => setOpen("perfil")} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1 text-left active:bg-muted">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/15 font-semibold text-brand">{lead.name.trim().charAt(0).toUpperCase() || "?"}</span>
          <span className="min-w-0">
            <span className="block truncate font-semibold leading-tight">{lead.name}</span>
            <span className="block truncate text-xs text-fg-muted">{lead.subtitle ?? "toque para ver o perfil"}</span>
          </span>
        </button>
        <button type="button" onClick={() => setOpen("perfil")} aria-label="Abrir perfil" className={iconBtn}><UserRound className="h-5 w-5" /></button>
        {telHref ? <a href={telHref} aria-label="Ligar" className={iconBtn}><Phone className="h-5 w-5" /></a> : null}
        {waHref ? <a href={waHref} target="_blank" rel="noopener noreferrer" aria-label="Abrir no WhatsApp" className={iconBtn}><MessageCircle className="h-5 w-5" /></a> : null}
        <Link href={`/agenda/novo?lead=${lead.id}`} aria-label="Agendar" className={iconBtn}><CalendarPlus className="h-5 w-5" /></Link>
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {chat}

        {menu ? <button type="button" aria-label="Fechar menu" className="absolute inset-0 z-10 bg-black/20" onClick={() => setMenu(false)} /> : null}

        <div className="absolute right-3 z-20 flex flex-col items-end gap-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))]">
          {menu ? (
            <ul className="mb-1 w-56 overflow-hidden rounded-2xl border border-border bg-surface shadow-xl" role="menu">
              {PANELS.map(({ key, label, icon: Icon }) => (
                <li key={key}>
                  <button type="button" role="menuitem" onClick={() => pick(key)} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-medium active:bg-muted hover:bg-muted">
                    <Icon className="h-5 w-5 text-brand" aria-hidden />{label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <button type="button" onClick={() => pick("ia")} aria-label="Falar com a IA sobre este lead"
              className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-surface text-brand shadow-lg active:scale-95">
              <Sparkles className="h-5 w-5" />
            </button>
          )}
          <button type="button" onClick={() => setMenu((m) => !m)} aria-label={menu ? "Fechar menu" : "Abrir menu do lead"} aria-expanded={menu}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-lg active:scale-95">
            <Plus className={cn("h-6 w-6 transition-transform", menu && "rotate-45")} />
          </button>
        </div>
      </div>

      <Sheet open={open === "perfil"} onClose={close} title="Perfil do lead">{profile}</Sheet>
      {PANELS.map(({ key, label }) => (
        <Sheet key={key} open={open === key} onClose={close} title={label}>{panels[key]}</Sheet>
      ))}
      <Sheet open={open === "ia"} onClose={close} title="Copiloto · este lead">
        <CopilotoChat lead={{ id: lead.id, name: lead.name }} className="h-[min(65dvh,560px)]" />
      </Sheet>
    </div>
  );
}
