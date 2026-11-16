"use client";
// Patient card used by the grid view of the patients directory.
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { calcAge, formatDate, fullName, initials } from "@/lib/format";
import { labelize } from "@/lib/constants";
import type { PatientListItem } from "./hooks";

const PAYMENT_TONES: Record<string, string> = {
  PAYG: "bg-teal-50 text-teal-700 border-teal-200",
  PACKAGE: "bg-indigo-50 text-indigo-700 border-indigo-200",
  INSURANCE: "bg-sky-50 text-sky-700 border-sky-200",
};

export function PatientCard({ patient: p, onOpen }: { patient: PatientListItem; onOpen: (id: string) => void }) {
  const name = fullName({ firstName: p.firstName, middleName: p.middleName, lastName: p.lastName });
  return (
    <button
      type="button"
      onClick={() => onOpen(p.id)}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-500/60 hover:shadow-md"
    >
      <div className="flex items-start gap-3">
        <Avatar className="h-11 w-11 rounded-xl">
          <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials(name)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="font-mono text-xs text-muted-foreground">{p.patientCode}</p>
        </div>
        <StatusBadge status={p.currentStatus} />
      </div>

      {p.activeEpisodeTitle ? (
        <p className="truncate rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-600">{p.activeEpisodeTitle}</p>
      ) : null}

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="Phone" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{p.phone || "—"}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="User" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{p.gender ? labelize(p.gender) : "—"} · {calcAge(p.dateOfBirth)}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="Stethoscope" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{p.assignedTherapist?.name || "Unassigned"}</dd>
        </div>
        <div className="flex items-center gap-1.5 text-slate-600">
          <AtomIcon name="CalendarDays" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <dd className="truncate">{formatDate(p.createdAt)}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between border-t pt-3">
        <Badge variant="outline" className={PAYMENT_TONES[p.paymentArrangement] || ""}>{labelize(p.paymentArrangement)}</Badge>
        <span className="flex items-center gap-1 text-xs font-medium text-teal-700 opacity-0 transition-opacity group-hover:opacity-100">
          Open profile <AtomIcon name="ArrowRight" className="h-3.5 w-3.5" />
        </span>
      </div>
    </button>
  );
}
