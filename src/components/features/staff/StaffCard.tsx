"use client";
// Staff card used by the grid view of the staff directory.
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { labelize } from "@/lib/constants";
import type { StaffListItem } from "./StaffPage";

export const STAFF_ROLE_TONES: Record<string, string> = {
  ADMIN: "bg-navy-50 text-navy-800 border-navy-200",
  PHYSIOTHERAPIST: "bg-teal-50 text-teal-700 border-teal-200",
  RECEPTIONIST: "bg-sky-50 text-sky-700 border-sky-200",
  MANAGEMENT: "bg-amber-50 text-amber-700 border-amber-200",
};

export function StaffCard({ staff: s, onOpen }: { staff: StaffListItem; onOpen: (id: string) => void }) {
  const initials = `${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase();
  const account = !s.hasAccount ? "No login" : s.accountActive ? "Login active" : "Login deactivated";
  return (
    <button
      type="button"
      onClick={() => onOpen(s.id)}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-500/60 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 rounded-xl">
          <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{s.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{s.staffCode}</p>
        </div>
        <StatusBadge status={s.employmentStatus} />
      </div>

      <p className="truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">
        {s.jobTitle}{s.department ? ` · ${s.department}` : ""}
      </p>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="Phone" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{s.phone || "—"}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="Mail" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{s.email || "—"}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="CalendarDays" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{s.employmentDate ? formatDate(s.employmentDate) : "—"}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name={s.hasAccount ? "Link2" : "Link2Off"} className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{account}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <Badge variant="outline" className={STAFF_ROLE_TONES[s.staffRole] || ""}>{labelize(s.staffRole)}</Badge>
        <span className="flex items-center gap-1 text-xs font-medium text-teal-700 opacity-0 transition-opacity group-hover:opacity-100">
          Open profile <AtomIcon name="ArrowRight" className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}
