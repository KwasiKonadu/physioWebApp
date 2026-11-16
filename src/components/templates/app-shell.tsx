"use client";
// TEMPLATE: AppShell — floating sidebar + sticky top bar + scrollable workspace + sticky footer
import { AppSidebar } from "@/components/organisms/app-sidebar";
import { TopBar } from "@/components/organisms/top-bar";
import { TopBarSlotsProvider } from "@/components/templates/topbar-slots";
import { APP } from "@/lib/constants";

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <TopBarSlotsProvider>
    <div className="min-h-screen bg-workspace">
      <div className="flex min-h-screen gap-0">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="sticky top-0 z-20 px-0">
            <TopBar />
          </div>
          {/* The ONE place page padding is defined — pages must not add their own outer padding or max-width. */}
          <main className="flex-1 px-4 py-5 md:px-6">{children}</main>
          <footer className="mt-auto border-t border-slate-200 bg-white/70 px-4 py-3 md:px-6">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <p>© {new Date().getFullYear()} {APP.fullName} · Accra, Ghana</p>
              <p>{APP.currency} · {APP.timezone}</p>
            </div>
          </footer>
        </div>
      </div>
    </div>
    </TopBarSlotsProvider>
  );
}
