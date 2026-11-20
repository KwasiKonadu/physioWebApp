"use client";
// FEATURE: Reports — patients / appointments / clinical / financial / staff with date range, charts, CSV export
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { PERMS, labelize } from "@/lib/constants";
import { formatMoney, formatDate, ymd } from "@/lib/format";
import { PageHeader } from "@/components/molecules/page-header";
import { TopBarTitle } from "@/components/templates/topbar-slots";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import { ReportType, RangePreset, PRESETS, PatientsReport, AppointmentsReport, ClinicalReport, FinancialReport, StaffReport, ReportData, TABS } from "./report-types";
import { parseYmd, previousRange, rangeFor, exportCsv } from "./report-utils";
import { PatientsTab } from "./PatientsReportTab";
import { AppointmentsTab } from "./AppointmentsReportTab";
import { ClinicalTab } from "./ClinicalReportTab";
import { FinancialTab } from "./FinancialReportTab";
import { StaffTab } from "./StaffReportTab";

export default function ReportsPage() {
  const user = useAuthStore((s) => s.user);
  const canView = hasPermission(user, PERMS.reportsView);

  // report type + date range live in the address bar (?type=financial&range=week), so refresh and shared links keep them
  const params = useSearchParams();
  const [type, setType] = useState<ReportType>(() => {
    const t = params.get("type");
    return TABS.some((x) => x.type === t) ? (t as ReportType) : "patients";
  });
  const [preset, setPreset] = useState<RangePreset>(() => {
    const r = params.get("range");
    return PRESETS.includes(r as RangePreset) ? (r as RangePreset) : "month";
  });
  const [customFrom, setCustomFrom] = useState<Date | undefined>(() => parseYmd(params.get("from")));
  const [customTo, setCustomTo] = useState<Date | undefined>(() => parseYmd(params.get("to")));

  useEffect(() => {
    const q = new URLSearchParams();
    if (type !== "patients") q.set("type", type);
    if (preset !== "month") q.set("range", preset);
    if (preset === "custom" && customFrom) q.set("from", ymd(customFrom));
    if (preset === "custom" && customTo) q.set("to", ymd(customTo));
    const qs = q.toString();
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }, [type, preset, customFrom, customTo]);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  // same report for the previous period of equal length, used for the change chips on the stat cards —
  // fetched in the SAME request (the server runs both in parallel)
  const prevRange = useMemo(() => previousRange(range), [range]);
  const withPrev = preset !== "custom" || (!!customFrom && !!customTo);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["reports", type, range.from, range.to, withPrev ? prevRange.from : "", withPrev ? prevRange.to : ""],
    queryFn: () => apiFetch<{ type: string; from: string; to: string; report: ReportData; prevReport?: ReportData }>(
      `/api/reports?type=${type}&from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}` +
      (withPrev ? `&prevFrom=${encodeURIComponent(prevRange.from)}&prevTo=${encodeURIComponent(prevRange.to)}` : "")
    ),
    enabled: canView,
  });
  const prevData = data?.prevReport ? { report: data.prevReport } : undefined;
  const prevLabel = `${formatDate(prevRange.from, { day: "numeric", month: "short" })} – ${formatDate(prevRange.to, { day: "numeric", month: "short" })}`;

  const csvPrefix = `gmrs-${type}-${ymd(new Date())}`;

  const exportCurrent = () => {
    if (!data) return;
    const r = data.report;
    if (type === "patients") {
      const p = r as PatientsReport;
      exportCsv(`${csvPrefix}.csv`, ["Patient", "Code", "Episode", "Sessions", "Therapist", "Discharged"],
        p.discharged.map((d) => [d.patientName, d.patientCode, d.episodeTitle, d.sessions, d.therapist, formatDate(d.closedDate)]));
    } else if (type === "appointments") {
      const a = r as AppointmentsReport;
      exportCsv(`${csvPrefix}.csv`, ["Therapist", "Completed", "Cancelled", "No-shows"],
        a.byTherapist.map((t) => [t.therapist, t.completed, t.cancelled, t.noShow]));
    } else if (type === "clinical") {
      const c = r as ClinicalReport;
      exportCsv(`${csvPrefix}.csv`, ["Patient", "Code", "Sessions since review", "Threshold", "Total sessions", "Therapist"],
        c.reviewsDueList.map((e) => [e.patientName, e.patientCode, e.sessionsSinceReview, e.threshold, e.totalSessions, e.therapist]));
    } else if (type === "financial") {
      const f = r as FinancialReport;
      exportCsv(`${csvPrefix}.csv`, ["Invoice", "Patient", "Total", "Paid", "Outstanding", "Status", "Arrangement", "Due"],
        f.outstandingList.map((i) => [i.invoiceNumber, i.patientName, formatMoney(i.totalCents), formatMoney(i.paidCents), formatMoney(i.outstandingCents), i.status, i.arrangement, i.dueDate ? formatDate(i.dueDate) : "—"]));
    } else {
      const s = r as StaffReport;
      exportCsv(`${csvPrefix}.csv`, ["Therapist", "Completed sessions", "Unique patients", "Active episodes", "Remuneration method", "Computed remuneration"],
        s.rows.map((t) => [t.name, t.completedSessions, t.uniquePatients, t.activeEpisodes, labelize(t.remunerationMethod), t.computedCents !== null ? formatMoney(t.computedCents) : "—"]));
    }
  };

  return (
    <div>
      <TopBarTitle><h1 className="truncate text-lg font-semibold text-navy-800">Management Reports</h1></TopBarTitle>
      <PageHeader
        title="Reports"
        description="Operational, clinical and financial reporting"
        icon="BarChart3"
        filters={
          <Tabs value={type} onValueChange={(v) => setType(v as ReportType)}>
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.type} value={t.type}>{t.label}</TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        }
      />

      <div className="mb-4">
        <DataToolbar
          filters={
            <>
              <Tabs value={preset} onValueChange={(v) => setPreset(v as RangePreset)}>
                <TabsList className="h-8">
                  <TabsTrigger value="today">Today</TabsTrigger>
                  <TabsTrigger value="week">This week</TabsTrigger>
                  <TabsTrigger value="month">This month</TabsTrigger>
                  <TabsTrigger value="quarter">Last 3 months</TabsTrigger>
                  <TabsTrigger value="custom" className="gap-1">
                    <AtomIcon name="CalendarRange" className="h-3.5 w-3.5" />
                    {preset === "custom" && customFrom && customTo
                      ? `${formatDate(customFrom, { month: "short", day: "numeric" })} – ${formatDate(customTo, { month: "short", day: "numeric" })}`
                      : "Custom"}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {preset === "custom" && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-36 justify-start font-normal">
                        <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
                        {customFrom ? formatDate(customFrom) : "From"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customFrom} onSelect={setCustomFrom} initialFocus />
                    </PopoverContent>
                  </Popover>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="w-36 justify-start font-normal">
                        <AtomIcon name="Calendar" className="mr-2 h-4 w-4" />
                        {customTo ? formatDate(customTo) : "To"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={customTo} onSelect={setCustomTo} initialFocus />
                    </PopoverContent>
                  </Popover>
                </>
              )}
            </>
          }
          onRefresh={() => void refetch()}
          refreshing={isFetching}
        >
          <Button variant="outline" size="sm" onClick={exportCurrent} disabled={!data}>
            <AtomIcon name="Download" className="mr-1.5 h-3.5 w-3.5" /> Export CSV
          </Button>
        </DataToolbar>
      </div>

      {canView && data ? (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <AtomIcon name="TrendingUp" className="h-3.5 w-3.5" />
          Change chips compare with the previous period ({prevLabel}).
        </p>
      ) : null}

      {!canView ? (
        <EmptyState icon="Lock" title="No access" description="You do not have permission to view reports." />
      ) : isLoading || !data ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : (
        <>
          {type === "patients" && <PatientsTab report={data.report as PatientsReport} prev={prevData?.report as PatientsReport | undefined} prevLabel={prevLabel} />}
          {type === "appointments" && <AppointmentsTab report={data.report as AppointmentsReport} prev={prevData?.report as AppointmentsReport | undefined} prevLabel={prevLabel} />}
          {type === "clinical" && <ClinicalTab report={data.report as ClinicalReport} prev={prevData?.report as ClinicalReport | undefined} prevLabel={prevLabel} />}
          {type === "financial" && <FinancialTab report={data.report as FinancialReport} prev={prevData?.report as FinancialReport | undefined} prevLabel={prevLabel} />}
          {type === "staff" && <StaffTab report={data.report as StaffReport} prev={prevData?.report as StaffReport | undefined} prevLabel={prevLabel} />}
        </>
      )}
    </div>
  );
}

// ---------------- Tabs ----------------
