"use client";
// Dashboard Right column: today's appointments, quick actions and recent activity.

import { formatMoney, minutesToTime } from "@/lib/format";
import { SectionCard } from "@/components/molecules/section-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AtomIcon } from "@/components/atoms/icon";
import { useUIStore } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import type { DashboardData } from "./dashboard-types";
import { ActivityRow } from "./DashboardParts";

export function DashboardRightColumn({ data, isLoading, quickActions }: { data: DashboardData | undefined; isLoading: boolean; quickActions: { label: string; hint: string; icon: string; tone: string; go: () => void }[] }) {
  const navigate = useUIStore((s) => s.navigate);
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <SectionCard title="Today's appointments" icon="CalendarDays" loading={isLoading}
          actions={<Button variant="outline" size="sm" onClick={() => navigate("appointments")}>View all</Button>}>
          {(data?.todaysAppointments || []).length === 0 ? (
            <EmptyState icon="CalendarX" title="No appointments today" description="Booked appointments will appear here." />
          ) : (
            <ScrollArea className="max-h-72 custom-scrollbar">
              <div className="space-y-1.5">
                {(data?.todaysAppointments || []).map((a) => (
                  <button key={a.id} type="button" className="flex w-full items-center gap-3 rounded-lg border border-transparent px-2 py-2 text-left transition-colors hover:border-slate-200 hover:bg-slate-50" onClick={() => navigate("appointments", { appointmentId: a.id })}>
                    <span className="w-16 shrink-0 rounded-md bg-navy-50 py-1 text-center text-xs font-semibold text-navy-800">{minutesToTime(a.time)}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.patientName} <span className="text-xs text-muted-foreground">{a.patientCode}</span></p>
                      <p className="truncate text-xs text-muted-foreground">{a.purpose || "Session"} · {a.therapist}{a.episodeTitle ? ` · ${a.episodeTitle}` : ""}</p>
                    </div>
                    <StatusBadge status={a.status} />
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </SectionCard>

      <SectionCard title="Quick actions" icon="Zap" description="Jump straight into common tasks">
        <div className="grid grid-cols-2 gap-3">
          {quickActions.map((q) => (
            <button key={q.label} type="button" onClick={q.go}
              className="group relative flex min-h-23 flex-col items-start gap-2 rounded-xl border bg-white p-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
              <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg transition-colors", q.tone)}>
                <AtomIcon name={q.icon} className="h-4.5 w-4.5" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-800">{q.label}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{q.hint}</span>
              </span>
              <AtomIcon name="ArrowUpRight" className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-300 transition-colors group-hover:text-slate-600" />
            </button>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="Recent activity" icon="History" loading={isLoading} className="flex-1">
          <ScrollArea className="max-h-96 custom-scrollbar">
            <div className="space-y-2.5">
              {(data?.activity.registrations || []).slice(0, 3).map((r) => (
                <ActivityRow key={`reg-${r.id}`} icon="UserPlus" title={`${r.name} registered`} subtitle={r.code} date={r.date} />
              ))}
              {(data?.activity.payments || []).slice(0, 3).map((p) => (
                <ActivityRow key={`pay-${p.id}`} icon="Banknote" title={`${formatMoney(p.amountCents)} — ${p.patient}`} subtitle={p.method.replace("_", " ")} date={p.date} />
              ))}
              {(data?.activity.sessions || []).slice(0, 3).map((s) => (
                <ActivityRow key={`ses-${s.id}`} icon="Activity" title={`Session completed — ${s.patient}`} subtitle={s.therapist} date={s.date} />
              ))}
              {(data?.activity.audit || []).slice(0, 4).map((a) => (
                <ActivityRow key={`aud-${a.id}`} icon="ShieldCheck" title={a.action.replaceAll("_", " ")} subtitle={a.userName || "System"} date={a.date} />
              ))}
            </div>
          </ScrollArea>
        </SectionCard>
    </div>
  );
}
