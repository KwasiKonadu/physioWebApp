"use client";
// ORGANISM: floating sidebar — dark navy icon rail + adjacent white navigation drawer.
// Spec: exactly one set of icons inside the navy rail; no chevrons; no dropdowns;
// expandable/collapsible; tooltips when collapsed; rounded floating appearance.
import { NAV_ITEMS, type ViewKey } from "@/lib/constants";
import { usePathname } from "next/navigation";
import { hasPermission, useAuthStore, useUIStore, viewFromPath } from "@/stores/app-store";
import { AtomIcon } from "@/components/atoms/icon";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

export function AppSidebar() {
  const user = useAuthStore((s) => s.user);
  const activeView = viewFromPath(usePathname());
  const storedCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const navigate = useUIStore((s) => s.navigate);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const isMobile = useIsMobile();
  const collapsed = isMobile ? true : storedCollapsed;

  const items = NAV_ITEMS.filter((item) => hasPermission(user, item.permission));

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        aria-label="Main navigation"
        className={cn(
          "sticky top-0 z-30 flex h-screen shrink-0 gap-0 self-start overflow-hidden bg-white border-r border-slate-200 transition-[width] duration-300",
          collapsed ? "w-17" : "w-62"
        )}
      >
        {/* Dark navy icon rail — the ONLY set of icons */}
        <nav className="flex h-full w-17 shrink-0 flex-col items-center bg-navy-900 py-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                onClick={toggleSidebar}
                className="group flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-300"
              >
                <AtomIcon name="Waves" className="h-5 w-5 text-teal-50 group-hover:hidden" />
                <AtomIcon
                  name={collapsed ? "ChevronsRight" : "ChevronsLeft"}
                  className="hidden h-5 w-5 text-teal-50 group-hover:block group-focus-visible:block"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-navy-800 text-white">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>

          <div className="mt-6 flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto custom-scrollbar">
            {items.map((item) => {
              const active = activeView === item.key;
              return (
                <Tooltip key={item.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => navigate(item.key)}
                      className={cn(
                        "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
                        active
                          ? "bg-teal-500/90 text-white shadow-[0_2px_10px_rgba(14,159,138,0.4)]"
                          : "text-slate-300/80 hover:bg-white/10 hover:text-white"
                      )}
                    >
                      <AtomIcon name={item.icon} className="h-5 w-5" />
                    </button>
                  </TooltipTrigger>
                  {collapsed ? <TooltipContent side="right" className="bg-navy-800 text-white">{item.label}</TooltipContent> : null}
                </Tooltip>
              );
            })}
          </div>
        </nav>

        {/* Adjacent white navigation drawer — menu names only */}
        {!collapsed && (
          <div className="flex h-full w-45 flex-col bg-white py-4">
            <div className="flex h-10 flex-col justify-center px-4">
              <p className="text-sm font-bold leading-tight tracking-tight text-navy-800">GMRS Physio</p>
              <p className="text-[11px] font-medium leading-tight text-muted-foreground">Clinic Management</p>
            </div>
            <nav className="mt-6 flex w-full flex-1 flex-col items-stretch gap-1 px-2 overflow-y-auto custom-scrollbar">
              {items.map((item) => {
                const active = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.key)}
                    className={cn(
                      "flex h-11 w-full shrink-0 items-center rounded-lg px-2 text-left text-sm transition-colors",
                      active
                        ? "bg-teal-50 font-semibold text-teal-700"
                        : "font-medium text-slate-500 hover:bg-navy-50 hover:text-navy-800"
                    )}
                  >
                    <span className={cn("h-1.5 w-1.5 rounded-full", active ? "bg-teal-600" : "bg-transparent")} />
                    <span className="ml-1.5 truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <p className="px-4 text-[10px] text-slate-400">v1.0 · Accra, Ghana</p>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export type { ViewKey };
