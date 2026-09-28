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
    <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
      <div className="px-5 py-5">
        <div className="text-lg font-bold tracking-tight">Copiloto</div>
        <div className="truncate text-xs text-fg-muted">{teamName}</div>
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              isActive(pathname, href) ? "bg-brand/10 text-brand" : "text-fg hover:bg-muted",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        ))}
      </nav>
      <Link href="/user" className="m-3 rounded-lg px-3 py-2 text-sm hover:bg-muted">
        <div className="truncate font-medium">{userName}</div>
        <div className="text-xs text-fg-muted">Meu perfil</div>
      </Link>
    </aside>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = [...NAV_ITEMS.filter((i) => i.mobile), MORE_ITEM];
  return (
    <nav
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur md:hidden"
      aria-label="Navegação principal"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(({ href, label, icon: Icon }) => (
          <li key={href}>
            <Link
              href={href}
              className={cn(
                "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium",
                isActive(pathname, href) || (href === "/mais" && NAV_ITEMS.some((i) => !i.mobile && isActive(pathname, i.href)))
                  ? "text-brand" : "text-fg-muted",
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
