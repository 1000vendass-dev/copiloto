import { BottomNav, Sidebar } from "@/components/layout/app-nav";
import { getSession } from "@/lib/auth";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <div className="flex min-h-dvh">
      <Sidebar teamName={session.teamName} userName={session.fullName ?? session.email} />
      <main className="min-w-0 flex-1 px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))] md:px-6 md:pb-10 md:pt-6">
        <div className="mx-auto w-full max-w-5xl">{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
