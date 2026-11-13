"use client";
// ORGANISM: top navigation bar — global search, notifications, profile menu, logout
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore, useUIStore } from "@/stores/app-store";
import { initials, relativeTime } from "@/lib/format";
import { AtomIcon } from "@/components/atoms/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

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
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

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

  const onSearch = (q: string) => {
    setSearch(q);
    if (q.length >= 2) setOpen(true);
  };

  const searchResults = useQuery({
    queryKey: ["global-search", search],
    queryFn: () => apiFetch<{ patients: { id: string; patientCode: string; firstName: string; lastName: string }[] }>(
      `/api/patients?search=${encodeURIComponent(search)}&pageSize=6`
    ),
    enabled: search.trim().length >= 2,
  });

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        {/* Global search */}
        <div className="relative w-full max-w-md">
          <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            onFocus={() => search.length >= 2 && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 200)}
            placeholder="Search patients by name, phone or ID…"
            className="h-9 pl-8"
            aria-label="Global search"
          />
          {open && search.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-11 z-50 overflow-hidden rounded-lg border bg-popover shadow-lg">
              <ScrollArea className="max-h-72 custom-scrollbar">
                {searchResults.isLoading ? (
                  <p className="p-3 text-sm text-muted-foreground">Searching…</p>
                ) : (searchResults.data?.patients || []).length === 0 ? (
                  <p className="p-3 text-sm text-muted-foreground">No matching patients found</p>
                ) : (
                  (searchResults.data?.patients || []).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-navy-50"
                      onClick={() => {
                        navigate("patients", { patientId: p.id });
                        setSearch("");
                        setOpen(false);
                      }}
                    >
                      <span className="truncate">
                        <span className="font-medium">{p.firstName} {p.lastName}</span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.patientCode}</span>
                    </button>
                  ))
                )}
              </ScrollArea>
            </div>
          )}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
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
    </header>
  );
}
