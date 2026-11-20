"use client";
// FEATURE: Dashboard — operational overview (metrics, clinical, financial, activity)
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { VIZ } from "./dashboard-viz";
import { PERMS } from "@/lib/constants";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import type { DashboardData, Range } from "./dashboard-types";
import { DashboardRangeBar } from "./DashboardRangeBar";
import { DashboardLeftColumn } from "./DashboardLeftColumn";
import { DashboardMiddleColumn } from "./DashboardMiddleColumn";
import { DashboardRightColumn } from "./DashboardRightColumn";

export default function DashboardPage() {
  const [range, setRange] = useState<Range>("today");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();
  const navigate = useUIStore((s) => s.navigate);
  const user = useAuthStore((s) => s.user);
  const quickActions = [
    { label: "Patients", hint: "Register & find records", icon: "UserPlus", tone: "bg-navy-50 text-navy-800 group-hover:bg-navy-800 group-hover:text-white", perm: PERMS.patientsView, go: () => navigate("patients") },
    { label: "Appointments", hint: "Book & manage the calendar", icon: "CalendarPlus", tone: "bg-sky-50 text-sky-600 group-hover:bg-sky-600 group-hover:text-white", perm: PERMS.appointmentsView, go: () => navigate("appointments") },
    { label: "Assessments", hint: "Clinical assessments", icon: "ClipboardList", tone: "bg-navy-50 text-navy-800 group-hover:bg-navy-800 group-hover:text-white", perm: PERMS.clinicalView, go: () => navigate("assessments") },
    { label: "Therapy sessions", hint: "Document treatments", icon: "Activity", tone: "bg-emerald-50 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white", perm: PERMS.clinicalView, go: () => navigate("therapy-sessions") },
    { label: "Invoices", hint: "Bill & record payments", icon: "Receipt", tone: "bg-rose-50 text-rose-600 group-hover:bg-rose-600 group-hover:text-white", perm: PERMS.billingView, go: () => navigate("billing", { focusTab: "invoices" }) },
    { label: "Reports", hint: "Operational insights", icon: "BarChart3", tone: "bg-amber-50 text-amber-600 group-hover:bg-amber-500 group-hover:text-white", perm: PERMS.reportsView, go: () => navigate("reports") },
  ].filter((q) => hasPermission(user, q.perm));

  const queryString = range === "custom" && customFrom && customTo
    ? `range=custom&from=${customFrom.toISOString()}&to=${customTo.toISOString()}`
    : `range=${range}`;

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range, customFrom?.toISOString(), customTo?.toISOString()],
    queryFn: () => apiFetch<DashboardData>(`/api/dashboard?${queryString}`),
  });

  const m = data?.metrics;
  const trend = data?.charts.trend || [];
  const windowDays = data?.charts.windowDays ?? 7;
  const windowLabel = range === "custom" ? "Selected range" : `Last ${windowDays} days`;
  const windowRevenue = trend.reduce((s, t) => s + t.revenue, 0);
  const avgRevenue = Math.round(windowRevenue / Math.max(1, trend.length));
  const totalAppts = trend.reduce((s, t) => s + t.appointments, 0);
  const totalSessions = trend.reduce((s, t) => s + t.sessions, 0);
  const totalNewPatients = trend.reduce((s, t) => s + t.newPatients, 0);
  const mix = [
    { name: "Pay-as-you-go", value: data?.revenue.paygCents ?? 0, color: VIZ.blue },
    { name: "Packages", value: data?.revenue.packageCents ?? 0, color: VIZ.teal },
    { name: "Insurance", value: data?.revenue.insuranceCents ?? 0, color: VIZ.amber },
  ];
  const mixTotal = mix.reduce((s, x) => s + x.value, 0) || 1;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Operational overview of clinic activity"
        icon="LayoutDashboard"
      />

      <DashboardRangeBar
        range={range} setRange={setRange}
        customFrom={customFrom} setCustomFrom={setCustomFrom}
        customTo={customTo} setCustomTo={setCustomTo}
      />

      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Patients" value={m?.totalPatients ?? 0} icon="Users" tone="navy" loading={isLoading} hint={`+${m?.newPatients ?? 0} new`} onClick={() => navigate("patients")} />
        <StatCard label="Active episodes" value={m?.activeEpisodes ?? 0} icon="GitBranch" tone="teal" loading={isLoading} onClick={() => navigate("patients")} />
        <StatCard label="Appts today" value={m?.todaysAppointments ?? 0} icon="CalendarDays" tone="sky" loading={isLoading} onClick={() => navigate("appointments")} />
        <StatCard label="Sessions done" value={m?.completedSessions ?? 0} icon="Activity" tone="emerald" loading={isLoading} hint="in period" onClick={() => navigate("therapy-sessions")} />
        <StatCard label="Reviews due" value={m?.reviewsDue ?? 0} icon="TrendingUp" tone="amber" loading={isLoading} onClick={() => navigate("progress-reviews")} />
        <StatCard label="Open invoices" value={m?.outstandingInvoices ?? 0} icon="Receipt" tone="rose" loading={isLoading} hint={m ? formatMoney(m.outstandingAmountCents) : undefined} onClick={() => navigate("billing", { focusTab: "invoices" })} />
        <StatCard label="Revenue" value={m ? formatMoney(m.revenueCollectedCents) : "—"} icon="Wallet" tone="teal" loading={isLoading} hint="in period" onClick={() => navigate("billing")} />
      </div>

      {/* Three independent columns — cards keep their natural height */}
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.35fr_1fr_1fr]">
        <DashboardLeftColumn windowLabel={windowLabel} windowRevenue={windowRevenue} avgRevenue={avgRevenue} totalAppts={totalAppts} totalSessions={totalSessions} totalNewPatients={totalNewPatients} trend={trend} data={data} isLoading={isLoading} />
        <DashboardMiddleColumn windowLabel={windowLabel} mix={mix} mixTotal={mixTotal} m={m} data={data} isLoading={isLoading} />
        <DashboardRightColumn data={data} isLoading={isLoading} quickActions={quickActions} />
      </div>
    </div>
  );
}
