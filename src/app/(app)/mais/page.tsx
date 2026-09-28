import Link from "next/link";
import { ChevronRight, UserCircle } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { NAV_ITEMS } from "@/components/layout/nav-config";

export default function MaisPage() {
  const items = [...NAV_ITEMS.filter((i) => !i.mobile), { href: "/user", label: "Meu perfil", icon: UserCircle }];
  return (
    <>
      <PageHeader title="Mais" />
      <Card className="divide-y divide-border p-0">
        {items.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex items-center gap-3 px-4 py-4 hover:bg-muted">
            <Icon className="h-5 w-5 text-fg-muted" aria-hidden />
            <span className="flex-1 font-medium">{label}</span>
            <ChevronRight className="h-4 w-4 text-fg-muted" aria-hidden />
          </Link>
        ))}
      </Card>
    </>
  );
}
