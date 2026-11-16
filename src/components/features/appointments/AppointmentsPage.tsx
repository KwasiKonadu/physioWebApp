"use client";
// ============ Appointments module page: calendar views, booking, actions, today list ============
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import { addDays, formatDate, minutesToTime, ymd } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { AppointmentCalendar } from "./AppointmentCalendar";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { BookingDialog } from "./BookingDialog";
import { AppointmentDetails } from "./AppointmentDetails";
import {
  AppointmentDto, APPOINTMENT_STATUS_OPTIONS, useAppointments, useAppointmentAction, useTherapists,
} from "./appointments-shared";

type View = "day" | "week" | "month";
const ALL = "all";

function anchorDateOf(anchor: string): Date {
  return new Date(`${anchor}T00:00:00`);
}

function mondayOf(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day));
  return x;
}

function rangeLabel(view: View, anchor: string): string {
  const d = anchorDateOf(anchor);
  if (view === "day") return formatDate(d, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  if (view === "week") {
    const mon = mondayOf(d);
    const sun = addDays(mon, 6);
    return `${formatDate(mon, { day: "numeric", month: "short" })} – ${formatDate(sun, { day: "numeric", month: "short", year: "numeric" })}`;
  }
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** Label for the "jump to today" button, relative to the period being viewed. */
function relativeLabel(view: View, anchor: string): string {
  const MS_DAY = 86_400_000;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = anchorDateOf(anchor);
  const yearSuffix = d.getFullYear() !== today.getFullYear();

  if (view === "day") {
    const diff = Math.round((d.getTime() - today.getTime()) / MS_DAY);
    if (diff === 0) return "Today";
    if (diff === 1) return "Tomorrow";
    if (diff === -1) return "Yesterday";
    // within a week: the weekday name is unambiguous; further out it would repeat, so show the date
    if (Math.abs(diff) <= 6) return d.toLocaleDateString("en-GB", { weekday: "long" });
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(yearSuffix ? { year: "numeric" } : {}) });
  }

  if (view === "week") {
    const mon = mondayOf(d);
    const diff = Math.round((mon.getTime() - mondayOf(today).getTime()) / (7 * MS_DAY));
    if (diff === 0) return "This week";
    if (diff === 1) return "Next week";
    if (diff === -1) return "Last week";
    const sun = addDays(mon, 6);
    const f = (x: Date, withYear: boolean) => x.toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) });
    return `${f(mon, false)} – ${f(sun, yearSuffix || sun.getFullYear() !== today.getFullYear())}`;
  }

  const diff = (d.getFullYear() - today.getFullYear()) * 12 + (d.getMonth() - today.getMonth());
  if (diff === 0) return "This month";
  if (diff === 1) return "Next month";
  if (diff === -1) return "Last month";
  // a month name stays unambiguous for a year; at 12 months away it would repeat, so add the year
  if (Math.abs(diff) <= 11) return d.toLocaleDateString("en-GB", { month: "long" });
  return d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function AppointmentsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.appointmentsManage);

  const [view, setView] = useState<View>("day");
  const [anchor, setAnchor] = useState<string>(() => ymd(new Date()));
  const [therapistFilter, setTherapistFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingWalkIn, setBookingWalkIn] = useState(false);
  const [presetPatientId, setPresetPatientId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);

  // consume navigation options from other modules (Patients → prefill booking; anywhere → open details).
  // Deferred consume + store subscription keeps setState out of the synchronous effect body.
  useEffect(() => {
    let cancelled = false;
    const consume = () => {
      if (cancelled) return;
      const opts = useUIStore.getState().navOpts;
      if (!opts) return;
      if (opts.appointmentId) setDetailsId(opts.appointmentId);
      if (opts.patientId) {
        setPresetPatientId(opts.patientId);
        setBookingWalkIn(false);
        setBookingOpen(true);
      }
      useUIStore.getState().clearOpts();
    };
    const t = setTimeout(consume, 0);
    const unsub = useUIStore.subscribe((s) => { if (s.navOpts) consume(); });
    return () => { cancelled = true; clearTimeout(t); unsub(); };
  }, []);

  const therapists = useTherapists();
  const query = useAppointments({
    view,
    date: anchor,
    therapistId: therapistFilter === ALL ? undefined : therapistFilter,
    status: statusFilter === ALL ? undefined : statusFilter,
  });
  const items = query.data?.items || [];
  const meta = query.data?.meta;

  const stats = useMemo(() => {
    const count = (st: string[]) => items.filter((i) => st.includes(i.status)).length;
    return {
      total: items.length,
      active: count(["SCHEDULED", "CONFIRMED"]),
      completed: count(["COMPLETED"]),
      missed: count(["CANCELLED", "NO_SHOW"]),
      walkIns: items.filter((i) => i.walkIn).length,
    };
  }, [items]);

  const action = useAppointmentAction();

  const shift = (dir: 1 | -1) => {
    const d = anchorDateOf(anchor);
    if (view === "day") d.setDate(d.getDate() + dir);
    else if (view === "week") d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir, 1);
    setAnchor(ymd(d));
  };

  const openBooking = (walkIn: boolean) => {
    setBookingWalkIn(walkIn);
    setPresetPatientId(null);
    setBookingOpen(true);
  };

  const todayKey = ymd(new Date());
  const dayListTitle = anchor === todayKey ? "Today's appointments" : "Appointments on this day";

  return (
    <div>
      <PageHeader
        title="Appointments"
        description="Booking calendar and schedule management"
        icon="CalendarDays"
      />

      <div className="mb-3">
        <DataToolbar
          filters={
            <>
              <Tabs value={view} onValueChange={(v) => setView(v as View)}>
                <TabsList className="h-8">
                  <TabsTrigger value="day" className="h-auto! px-3 text-xs" title={view === "day" ? "Click again to jump to today" : undefined} onClick={() => { if (view === "day") setAnchor(todayKey); }}>Day</TabsTrigger>
                  <TabsTrigger value="week" className="h-auto! px-3 text-xs" title={view === "week" ? "Click again to jump to this week" : undefined} onClick={() => { if (view === "week") setAnchor(todayKey); }}>Week</TabsTrigger>
                  <TabsTrigger value="month" className="h-auto! px-3 text-xs" title={view === "month" ? "Click again to jump to this month" : undefined} onClick={() => { if (view === "month") setAnchor(todayKey); }}>Month</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(-1)} aria-label="Previous">
                  <AtomIcon name="ChevronLeft" className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 min-w-24" onClick={() => setAnchor(todayKey)} title="Jump to today">{relativeLabel(view, anchor)}</Button>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shift(1)} aria-label="Next">
                  <AtomIcon name="ChevronRight" className="h-4 w-4" />
                </Button>
              </div>
              <Select value={therapistFilter} onValueChange={setTherapistFilter}>
                <SelectTrigger className="w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All therapists</SelectItem>
                  {(therapists.data || []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {APPOINTMENT_STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          }
          onRefresh={() => qc.invalidateQueries({ queryKey: ["appointments"] })}
          refreshing={query.isFetching}
        >
          {canManage ? (
            <>
              <Button variant="outline" onClick={() => openBooking(true)}>
                <AtomIcon name="Zap" className="h-4 w-4" /> Walk-in
              </Button>
              <Button onClick={() => openBooking(false)}>
                <AtomIcon name="Plus" className="h-4 w-4" /> New appointment
              </Button>
            </>
          ) : null}
        </DataToolbar>
      </div>

      {/* range stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={view === "day" ? "Appointments today" : "Appointments in range"} value={stats.total} icon="CalendarDays" tone="navy" loading={query.isLoading}
          hint={stats.walkIns ? `${stats.walkIns} walk-in${stats.walkIns > 1 ? "s" : ""}` : undefined} />
        <StatCard label="Scheduled & confirmed" value={stats.active} icon="CalendarCheck" tone="sky" loading={query.isLoading} />
        <StatCard label="Completed" value={stats.completed} icon="CheckCheck" tone="emerald" loading={query.isLoading} />
        <StatCard label="Cancelled / no-show" value={stats.missed} icon="UserX" tone="rose" loading={query.isLoading} />
      </div>

      {/* calendar (+ the day list beside it in day view) */}
      <div className={view === "day" ? "grid items-start gap-4 xl:grid-cols-[3fr_2fr]" : undefined}>
      <SectionCard
        className="min-w-0"
        title={view === "day" ? "Day schedule" : view === "week" ? "Week schedule" : "Month overview"}
        description={rangeLabel(view, anchor)}
        icon={view === "month" ? "Grid3x3" : "CalendarDays"}
      >
        {query.isError ? (
          <EmptyState
            icon="CloudOff"
            title="Couldn't load the schedule"
            description={query.error instanceof Error ? query.error.message : "Please try again."}
            action={<Button variant="outline" size="sm" onClick={() => query.refetch()}>Retry</Button>}
          />
        ) : (
          <AppointmentCalendar
            view={view}
            anchorDate={anchorDateOf(anchor)}
            items={items}
            loading={query.isLoading}
            onSelect={(a: AppointmentDto) => setDetailsId(a.id)}
            onDayClick={(d) => { setAnchor(d); setView("day"); }}
          />
        )}
      </SectionCard>

      {/* compact today list (day view only) */}
      {view === "day" ? (
        <div className="min-w-0">
          <SectionCard
            title={dayListTitle}
            icon="ListChecks"
            description={meta ? `${items.length} appointment${items.length === 1 ? "" : "s"} · ${formatDate(anchorDateOf(anchor))}` : undefined}
            loading={query.isLoading}
          >
            {items.length === 0 ? (
              <EmptyState
                icon="CalendarOff"
                title="Nothing scheduled"
                description={canManage ? "Use “New appointment” or “Walk-in” to fill this day." : "No appointments for this day."}
                action={canManage ? <Button size="sm" onClick={() => openBooking(false)}><AtomIcon name="Plus" className="h-4 w-4" /> New appointment</Button> : undefined}
              />
            ) : (
              <div className="space-y-2">
                {items.map((a) => (
                  <div
                    key={a.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailsId(a.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") setDetailsId(a.id); }}
                    className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border bg-white p-3 transition-colors hover:bg-muted/40"
                  >
                    <div className="w-20 shrink-0 text-center">
                      <p className="text-sm font-semibold">{minutesToTime(a.startMin)}</p>
                      <p className="text-[10px] text-muted-foreground">to {minutesToTime(a.endMin)}</p>
                    </div>
                    <span className="h-9 w-1 shrink-0 rounded-full bg-border" />
                    <div className="min-w-40 flex-1">
                      <p className="truncate text-sm font-medium">
                        {a.patient.firstName} {a.patient.lastName}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">{a.patient.patientCode}{a.walkIn ? " · walk-in" : ""}</span>
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.purpose || "—"} · {a.therapist ? `${a.therapist.firstName} ${a.therapist.lastName}` : "—"}
                        {a.sessions?.length ? " · session created" : ""}
                      </p>
                    </div>
                    <StatusBadge status={a.status} className="ml-auto hidden sm:inline-flex" />
                    {canManage ? (
                      <div className="flex shrink-0 items-center gap-1.5 max-xl:order-last max-xl:w-full max-xl:justify-end">
                        {a.status === "SCHEDULED" ? (
                          <Button variant="outline" size="sm" className="h-8" disabled={action.isPending}
                            onClick={(e) => { e.stopPropagation(); action.mutate({ id: a.id, body: { action: "confirm" }, successMsg: "Appointment confirmed" }); }}>
                            Confirm
                          </Button>
                        ) : null}
                        {["SCHEDULED", "CONFIRMED"].includes(a.status) ? (
                          <Button variant="outline" size="sm" className="h-8" disabled={action.isPending}
                            onClick={(e) => { e.stopPropagation(); action.mutate({ id: a.id, body: { action: "complete" }, successMsg: "Marked completed" }); }}>
                            Complete
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                    <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      ) : null}
      </div>

      <BookingDialog
        open={bookingOpen}
        onOpenChange={setBookingOpen}
        presetPatientId={presetPatientId}
        presetWalkIn={bookingWalkIn}
        defaultDate={anchor}
        therapists={therapists.data || []}
      />
      <AppointmentDetails
        appointmentId={detailsId}
        open={!!detailsId}
        onOpenChange={(o) => { if (!o) setDetailsId(null); }}
      />
    </div>
  );
}
