import { Car, Contact, Home, Settings, Users, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

/** Itens entram no menu conforme cada fase é concluída e validada. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Meu dia", icon: Home, mobile: true },
  { href: "/leads", label: "Leads", icon: Users, mobile: true },
  { href: "/estoque", label: "Estoque", icon: Car, mobile: true },
  { href: "/clientes", label: "Clientes", icon: Contact },
  { href: "/configuracoes", label: "Configurações", icon: Settings, mobile: true },
];
