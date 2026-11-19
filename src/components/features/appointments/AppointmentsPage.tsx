"use client";
// ============ Appointments module page: calendar views, booking, actions, today list ============
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import { PERMS } from "@/lib/constants";
import { ymd } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { TopBarTitle } from "@/components/templates/topbar-slots";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { Button } from "@/components/ui/button";
import { AppointmentCalendar } from "./AppointmentCalendar";
import { View, ALL, anchorDateOf, rangeLabel } from "./appointments-dates";
import { AppointmentsToolbar } from "./AppointmentsToolbar";
import { DayAppointmentList } from "./DayAppointmentList";
import { BookingDialog } from "./BookingDialog";
import { AppointmentDetails } from "./AppointmentDetails";
import { AppointmentDto, useAppointments, useAppointmentAction, useTherapists } from "./appointments-shared";

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
      <TopBarTitle><h1 className="truncate text-lg font-semibold text-navy-800">Appointments</h1></TopBarTitle>
      <PageHeader
        title="Appointments"
        description="Booking calendar and schedule management"
        icon="CalendarDays"
      />

      <div className="mb-3">
        <AppointmentsToolbar
          view={view} setView={setView}
          anchor={anchor} setAnchor={setAnchor} todayKey={todayKey} shift={shift}
          therapistFilter={therapistFilter} setTherapistFilter={setTherapistFilter}
          statusFilter={statusFilter} setStatusFilter={setStatusFilter}
          therapists={therapists.data || []}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["appointments"] })}
          refreshing={query.isFetching}
          canManage={canManage}
          openBooking={openBooking}
        />
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
          <DayAppointmentList
            items={items}
            anchor={anchor}
            title={dayListTitle}
            loading={query.isLoading}
            canManage={canManage}
            action={action}
            onSelect={setDetailsId}
            onNew={() => openBooking(false)}
          />
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
