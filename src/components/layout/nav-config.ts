import { Home, Settings, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; mobile?: boolean };

/** Itens entram no menu conforme cada fase é concluída e validada. */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Meu dia", icon: Home, mobile: true },
  { href: "/configuracoes", label: "Configurações", icon: Settings, mobile: true },
];
