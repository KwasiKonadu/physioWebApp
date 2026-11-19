"use client";
// ORGANISM: floating sidebar — dark navy icon rail + adjacent white navigation drawer.
// Spec: exactly one set of icons inside the navy rail; no chevrons; no dropdowns;
// expandable/collapsible; tooltips when collapsed; rounded floating appearance.
import { useState } from "react";
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
  const [hovered, setHovered] = useState<string | null>(null);
  const isMobile = useIsMobile();
  const collapsed = isMobile ? true : storedCollapsed;

  const items = NAV_ITEMS.filter((item) => hasPermission(user, item.permission));

  return (
    <TooltipProvider delayDuration={100}>
      <aside
        aria-label="Main navigation"
        className={cn(
          "sticky top-0 z-30 flex h-screen shrink-0 gap-0 self-start overflow-hidden bg-navy-900 border-r border-navy-900 transition-[width] duration-300",
          collapsed ? "w-14" : "w-51.5"
        )}
      >
        {/* Dark navy icon rail — the ONLY set of icons */}
        <nav className={cn("flex h-full shrink-0 flex-col items-center bg-navy-900 py-3", collapsed ? "w-14" : "w-11.5 pl-2.5")}>
          <Tooltip key={`toggle-${collapsed}`}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-expanded={!collapsed}
                onClick={() => { setHovered(null); toggleSidebar(); }}
                className="group flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <img src="/appicon.svg" alt="" className="h-5 w-5 group-hover:hidden" />
                <AtomIcon
                  name={collapsed ? "ChevronsRight" : "ChevronsLeft"}
                  className="hidden h-4 w-4 text-white group-hover:block group-focus-visible:block"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              {collapsed ? "Expand sidebar" : "Collapse sidebar"}
            </TooltipContent>
          </Tooltip>

          <div className="mt-4 flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto custom-scrollbar">
            {items.map((item) => {
              const active = activeView === item.key;
              return (
                <Tooltip key={`${item.key}-${collapsed}`}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label={item.label}
                      aria-current={active ? "page" : undefined}
                      onClick={() => navigate(item.key)}
                      onMouseEnter={() => setHovered(item.key)}
                      onMouseLeave={() => setHovered(null)}
                      className={cn(
                        "flex h-9 items-center justify-center rounded-lg transition-colors",
                        "w-9", !collapsed && "rounded-r-none",
                        active
                          ? "bg-white text-navy-800 shadow-[0_2px_10px_rgba(8,28,51,0.35)]"
                          : hovered === item.key ? "bg-white/10 text-white" : "text-slate-300/80"
                      )}
                    >
                      <AtomIcon name={item.icon} className="h-4.5 w-4.5" />
                    </button>
                  </TooltipTrigger>
                  {collapsed ? <TooltipContent side="right">{item.label}</TooltipContent> : null}
                </Tooltip>
              );
            })}
          </div>
        </nav>

        {/* Adjacent white navigation drawer — menu names only */}
        {!collapsed && (
          <div className="flex h-full w-40 flex-col bg-navy-900 py-3">
            <div className="flex h-9 flex-col justify-center px-3">
              <p className="text-sm font-bold leading-tight tracking-tight text-white">GMRS Physio</p>
              <p className="text-[11px] font-medium leading-tight text-slate-300/70">Clinic Management</p>
            </div>
            <nav className="mt-4 flex w-full flex-1 flex-col items-stretch gap-0.5 pr-1.5 overflow-y-auto custom-scrollbar">
              {items.map((item) => {
                const active = activeView === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => navigate(item.key)}
                    onMouseEnter={() => setHovered(item.key)}
                    onMouseLeave={() => setHovered(null)}
                    className={cn(
                      "flex h-9 w-full shrink-0 items-center rounded-lg rounded-l-none pl-0 pr-2 text-left text-[13px] transition-colors",
                      active
                        ? "bg-white font-semibold text-navy-800 shadow-[0_2px_10px_rgba(8,28,51,0.35)]"
                        : hovered === item.key ? "bg-white/10 font-medium text-white" : "font-medium text-slate-300/80"
                    )}
                  >
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        )}
      </aside>
    </TooltipProvider>
  );
}

export type { ViewKey };
