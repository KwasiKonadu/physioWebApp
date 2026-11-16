"use client";
// ORGANISM: top navigation bar — page title + tabs (rendered by pages via slots), actions, notifications, profile
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore, useUIStore, viewFromPath } from "@/stores/app-store";
import { initials, relativeTime } from "@/lib/format";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "@/lib/constants";
import { useTopBarSlots } from "@/components/templates/topbar-slots";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  type: string;
  read: boolean;
  createdAt: string;
}

export function TopBar() {
  const user = useAuthStore((s) => s.user);
  const clear = useAuthStore((s) => s.clear);
  const navigate = useUIStore((s) => s.navigate);
  const router = useRouter();
  const queryClient = useQueryClient();
  const slots = useTopBarSlots();
  const activeView = viewFromPath(usePathname());
  const fallbackTitle = NAV_ITEMS.find((i) => i.key === activeView)?.label;

  const notifications = useQuery({
    queryKey: ["notifications"],
    queryFn: () => apiFetch<{ items: NotificationItem[] }>("/api/notifications"),
    refetchInterval: 30_000,
  });

  const markAll = useMutation({
    mutationFn: () => apiFetch("/api/notifications", { method: "PATCH", json: { all: true } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const logout = () => {
    apiFetch("/api/auth/logout", { method: "POST", json: {} }).catch(() => undefined);
    clear();
    router.refresh();
    toast.success("Signed out");
  };

  const unread = (notifications.data?.items || []).filter((n) => !n.read).length;

  return (
    <header className="sticky top-0 z-20 flex h-24 flex-col border-b border-slate-200 bg-white">
      {/* Row 1: page title + actions + notifications + profile */}
      <div className="flex h-14 shrink-0 items-center gap-3 px-4 md:px-6">
        {/* Page title — filled by <PageHeader>; falls back to the section name */}
        <div ref={slots?.setTitle} className="peer min-w-0 flex-1 empty:hidden" />
        <div className="hidden min-w-0 flex-1 peer-empty:block">
          <h1 className="truncate text-lg font-semibold tracking-tight md:text-xl">{fallbackTitle}</h1>
        </div>

        <div ref={slots?.setActions} className="shrink-0 empty:hidden" />
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Notifications */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
                <AtomIcon name="Bell" className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-teal-600 px-1 text-[10px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 p-0">
              <div className="flex items-center justify-between border-b px-4 py-3">
                <p className="text-sm font-semibold">Notifications</p>
                {unread > 0 && (
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => markAll.mutate()}>
                    Mark all read
                  </Button>
                )}
              </div>
              <ScrollArea className="max-h-96 custom-scrollbar">
                {(notifications.data?.items || []).length === 0 ? (
                  <p className="p-6 text-center text-sm text-muted-foreground">No notifications</p>
                ) : (
                  (notifications.data?.items || []).map((n) => (
                    <div key={n.id} className={cn("border-b px-4 py-3 last:border-0", !n.read && "bg-teal-50/40")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium">{n.title}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{relativeTime(n.createdAt)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.message}</p>
                    </div>
                  ))
                )}
              </ScrollArea>
            </PopoverContent>
          </Popover>

          {/* Profile */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-navy-50" aria-label="Account menu">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-navy-800 text-xs text-white">{initials(user?.name)}</AvatarFallback>
                </Avatar>
                <div className="hidden text-left md:block">
                  <p className="text-sm font-semibold leading-tight">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground leading-tight">{user?.role}</p>
                </div>
                <AtomIcon name="ChevronDown" className="hidden h-4 w-4 text-muted-foreground md:block" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <p>{user?.name}</p>
                <p className="text-xs font-normal text-muted-foreground">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("settings", { focusTab: "account" })}>
                <AtomIcon name="UserCog" className="mr-2 h-4 w-4" /> Account settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout} className="text-rose-600 focus:text-rose-600">
                <AtomIcon name="LogOut" className="mr-2 h-4 w-4" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* Row 2: tabs — always reserved so the bar height is identical on every page */}
      <div
        ref={slots?.setTabs}
        className={cn(
          "flex h-10 shrink-0 items-stretch overflow-x-auto px-4 md:px-6",
          // Underline tab style (scoped to the top bar only; pill tabs elsewhere are unchanged)
          "[&>div]:flex [&>div]:items-stretch",
          "**:data-[slot=tabs]:h-full **:data-[slot=tabs]:gap-0",
          "**:data-[slot=tabs-list]:h-full **:data-[slot=tabs-list]:w-auto **:data-[slot=tabs-list]:justify-start **:data-[slot=tabs-list]:gap-6 **:data-[slot=tabs-list]:rounded-none **:data-[slot=tabs-list]:bg-transparent! **:data-[slot=tabs-list]:p-0",
          "**:data-[slot=tabs-trigger]:h-full **:data-[slot=tabs-trigger]:flex-none **:data-[slot=tabs-trigger]:rounded-none **:data-[slot=tabs-trigger]:border-0 **:data-[slot=tabs-trigger]:border-b-2 **:data-[slot=tabs-trigger]:border-transparent! **:data-[slot=tabs-trigger]:bg-transparent! **:data-[slot=tabs-trigger]:items-end **:data-[slot=tabs-trigger]:px-1 **:data-[slot=tabs-trigger]:pb-2 **:data-[slot=tabs-trigger]:pt-0 **:data-[slot=tabs-trigger]:text-sm **:data-[slot=tabs-trigger]:font-medium **:data-[slot=tabs-trigger]:text-slate-500 **:data-[slot=tabs-trigger]:shadow-none **:data-[slot=tabs-trigger]:hover:text-navy-800",
          "[&_[data-slot=tabs-trigger][data-state=active]]:border-navy-900! [&_[data-slot=tabs-trigger][data-state=active]]:font-semibold [&_[data-slot=tabs-trigger][data-state=active]]:text-navy-900 [&_[data-slot=tabs-trigger][data-state=active]]:shadow-none"
        )}
      />
    </header>
  );
}
