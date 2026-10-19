"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MORE_ITEM, NAV_ITEMS } from "./nav-config";

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar({ teamName, userName }: { teamName: string; userName: string }) {
  const pathname = usePathname();
  return (
    <aside className="glass sticky top-3 m-3 hidden h-[calc(100dvh-1.5rem)] w-60 shrink-0 flex-col rounded-[28px] md:flex">
      <div className="flex items-center gap-3 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-brand text-base font-bold text-white shadow-[0_8px_20px_-8px] shadow-brand/70">C</span>
        <div className="min-w-0">
          <div className="text-base font-bold tracking-tight">Copiloto</div>
          <div className="truncate text-xs text-fg-muted">{teamName}</div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-colors",
              isActive(pathname, href) ? "bg-brand text-white shadow-[0_8px_20px_-10px] shadow-brand/70" : "text-fg-muted hover:bg-muted hover:text-fg",
            )}
          >
            <Icon className="h-[18px] w-[18px]" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <Link href="/user" className="m-3 flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-muted">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted-2 text-sm font-semibold">{userName.trim().charAt(0).toUpperCase()}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium">{userName}</span>
          <span className="block text-xs text-fg-muted">Meu perfil</span>
        </span>
      </Link>
    </aside>
  );
}

/**
 * Menu do celular: pílula de vidro flutuando sobre o conteúdo. O item ativo vira uma pílula azul com o nome;
 * os outros mostram só o ícone (o nome fica para leitor de tela).
 */
export function BottomNav() {
  const pathname = usePathname();
  const items = [...NAV_ITEMS.filter((i) => i.mobile), MORE_ITEM];
  const activeHref = items.find((i) => isActive(pathname, i.href))?.href
    ?? (NAV_ITEMS.some((i) => !i.mobile && isActive(pathname, i.href)) ? MORE_ITEM.href : null);
  return (
    <nav
      className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 md:hidden"
      aria-label="Navegação principal"
    >
      <ul className="glass-float mx-auto flex max-w-md items-center justify-between gap-1 rounded-full p-1.5">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === activeHref;
          return (
            <li key={href} className={cn(active ? "flex-[1.6]" : "flex-1")}>
              <Link
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-12 items-center justify-center gap-1.5 rounded-full text-[13px] font-semibold transition-all",
                  active ? "bg-brand text-white shadow-[0_8px_20px_-8px] shadow-brand/70" : "text-fg-muted active:bg-muted",
                )}
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                {active ? <span className="truncate">{label}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
