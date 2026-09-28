import { BarChart3, CalendarDays, FileText, Car, CheckSquare, Contact, Home, Menu, Settings, Sparkles, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

/** Itens entram no menu conforme cada fase é concluída e validada. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Meu dia", icon: Home, mobile: true },
  { href: "/copiloto", label: "Copiloto", icon: Sparkles, mobile: true },
  { href: "/leads", label: "Leads", icon: Users, mobile: true },
  { href: "/estoque", label: "Estoque", icon: Car, mobile: true },
  { href: "/agenda", label: "Agenda", icon: CalendarDays },
  { href: "/tarefas", label: "Tarefas", icon: CheckSquare },
  { href: "/painel", label: "Painel", icon: BarChart3 },
  { href: "/clientes", label: "Clientes", icon: Contact },
  { href: "/propostas", label: "Propostas", icon: FileText },
  { href: "/configuracoes", label: "Configurações", icon: Settings },
];

/** Na barra inferior do celular: itens `mobile` + "Mais" (lista o restante). */
export const MORE_ITEM: NavItem = { href: "/mais", label: "Mais", icon: Menu, mobile: true };
