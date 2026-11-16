"use client";
// ============ Staff profile: summary card + tabs (overview, workload, remuneration, login account) ============
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { PERMS, REMUNERATION_METHODS, labelize } from "@/lib/constants";
import { formatDate, formatMoney, toCents } from "@/lib/format";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportBarChart } from "@/components/features/reports/ReportBarChart";
import { ReportDonut } from "@/components/features/reports/ReportDonut";
import StaffFormDialog, { type StaffFormTarget } from "./staff-form-dialog";
import { STAFF_ROLE_TONES } from "./StaffCard";
import StaffPatientsTab from "./StaffPatientsTab";

interface StaffDetail {
  staff: {
    id: string; staffCode: string; firstName: string; lastName: string;
    email: string | null; phone: string | null; jobTitle: string; department: string | null;
    staffRole: string; employmentStatus: string; employmentDate: string | null;
    professionalDesignation: string | null; specialization: string | null;
    qualifications: string[]; availability: { day: string; start?: string; end?: string }[];
    remunerationMethod: string; remunerationRateCents: number | null; isTherapist: boolean;
    branchId: string | null;
  };
  branchName: string | null;
  account: { id: string; email: string; name: string; active: boolean; roleName: string } | null;
  stats: { completedSessions: number; uniquePatients: number; activeEpisodes: number };
}

interface StatsResponse {
  stats: {
    completedSessions: number; uniquePatients: number; activeEpisodes: number;
    appointmentsCompleted: number; noShows: number; upcomingAppointments: number;
  };
  remuneration: { method: string; rateCents: number | null; computedCents: number | null };
  trend: { month: string; sessions: number }[];
  monthly: { month: string; sessions: number; patients: number; booked: number; completed: number; noShows: number; cancelled: number }[];
  statusBreakdown: { status: string; count: number }[];
  byWeekday: { day: string; sessions: number }[];
}

const PERIODS = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "last_7", label: "Last 7 days" },
  { value: "last_30", label: "Last 30 days" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
] as const;
type Period = (typeof PERIODS)[number]["value"];

function periodRange(p: Period): { from: string; to: string } {
  const n = new Date();
  const sod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
  const eod = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const addDays = (d: Date, k: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + k);
  const today = sod(n);
  const monday = addDays(today, -((today.getDay() + 6) % 7)); // weeks run Monday–Sunday
  const range = (from: Date, to: Date) => ({ from: from.toISOString(), to: eod(to).toISOString() });
  switch (p) {
    case "today": return range(today, today);
    case "yesterday": return range(addDays(today, -1), addDays(today, -1));
    case "this_week": return range(monday, today);
    case "last_week": return range(addDays(monday, -7), addDays(monday, -1));
    case "last_7": return range(addDays(today, -6), today);
    case "last_30": return range(addDays(today, -29), today);
    case "last_month": return range(new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0));
    case "last_3": return range(new Date(n.getFullYear(), n.getMonth() - 2, 1), today);
    case "this_year": return range(new Date(n.getFullYear(), 0, 1), today);
    default: return range(new Date(n.getFullYear(), n.getMonth(), 1), today);
  }
}

export default function StaffProfile({ staffId, onBack }: { staffId: string; onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.staffManage);
  const canManageUsers = hasPermission(user, PERMS.settingsManage);
  const qc = useQueryClient();

  const [period, setPeriod] = useState<Period>("this_month");
  const [rateGhs, setRateGhs] = useState("");
  const [method, setMethod] = useState("FIXED");
  const [savingRem, setSavingRem] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRoleId, setCreateRoleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [editTarget, setEditTarget] = useState<StaffFormTarget | null>(null);

  const detailQ = useQuery({
    queryKey: ["staff", "detail", staffId],
    queryFn: () => apiFetch<StaffDetail>(`/api/staff/${staffId}`),
  });
  const data = detailQ.data;
  const s = data?.staff;

  const range = periodRange(period);
  const statsQ = useQuery({
    queryKey: ["staff", "stats", staffId, range.from, range.to],
    queryFn: () => apiFetch<StatsResponse>(`/api/staff/${staffId}/stats?from=${encodeURIComponent(range.from)}&to=${encodeURIComponent(range.to)}`),
    enabled: !!s,
  });
  const stats = statsQ.data;

  // number of patients assigned to this therapist, for the tab label
  const patientCountQ = useQuery({
    queryKey: ["patients", "count-for-staff", staffId],
    queryFn: () => apiFetch<{ total: number }>(`/api/patients?therapistId=${staffId}&pageSize=1`),
    enabled: !!s?.isTherapist,
  });

  const rolesQ = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/api/roles"),
    enabled: createOpen && canManageUsers,
  });

  // keep the remuneration editor in step with the loaded profile
  const [prevStaff, setPrevStaff] = useState(s);
  if (s !== prevStaff) {
    setPrevStaff(s);
    if (s) {
      setMethod(s.remunerationMethod);
      setRateGhs(s.remunerationRateCents ? String(s.remunerationRateCents / 100) : "");
    }
  }

  // only therapists can be paid per session / per patient; everyone else is salaried
  const effMethod = s?.isTherapist ? method : "FIXED";

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["staff"] });
    await qc.invalidateQueries({ queryKey: ["users"] });
  };

  const saveRemuneration = async () => {
    setSavingRem(true);
    try {
      await apiFetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        json: {
          remunerationMethod: effMethod,
          remunerationRateCents: parseFloat(rateGhs || "0") > 0 ? toCents(parseFloat(rateGhs)) : null,
        },
      });
      toast.success("Remuneration updated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update remuneration");
    } finally {
      setSavingRem(false);
    }
  };

  const toggleAccount = async (active: boolean) => {
    if (!data?.account) return;
    try {
      await apiFetch(`/api/users/${data.account.id}`, { method: "PATCH", json: { active } });
      toast.success(active ? "Account activated" : "Account deactivated");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update account");
    }
  };

  const resetPassword = async () => {
    if (!data?.account) return;
    if (newPassword.length < 8) return void toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      await apiFetch(`/api/users/${data.account.id}`, { method: "PATCH", json: { password: newPassword } });
      toast.success("Password reset");
      setResetOpen(false);
      setNewPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reset password");
    } finally {
      setBusy(false);
    }
  };

  const createAccount = async () => {
    if (!s) return;
    if (!createEmail.includes("@")) return void toast.error("Enter a valid email");
    if (createPassword.length < 8) return void toast.error("Password must be at least 8 characters");
    if (!createRoleId) return void toast.error("Choose a role");
    setBusy(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        json: { email: createEmail, name: `${s.firstName} ${s.lastName}`, password: createPassword, roleId: createRoleId, staffId: s.id },
      });
      toast.success("Login account created");
      setCreateOpen(false);
      setCreatePassword("");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    if (!s) return;
    setEditTarget({
      id: s.id, firstName: s.firstName, lastName: s.lastName, email: s.email, phone: s.phone, jobTitle: s.jobTitle,
      department: s.department, staffRole: s.staffRole, employmentDate: s.employmentDate, employmentStatus: s.employmentStatus,
      branchId: s.branchId,
      professionalDesignation: s.professionalDesignation, specialization: s.specialization,
      qualifications: s.qualifications || [], availability: s.availability || [],
      remunerationMethod: s.remunerationMethod, remunerationRateCents: s.remunerationRateCents,
    });
  };

  if (detailQ.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }
  if (detailQ.isError || !s || !data) {
    return (
      <>
        <PageBreadcrumb items={[{ label: "Staff", onClick: onBack }, { label: "Not found" }]} />
        <EmptyState icon="UserX" title="Staff member not found" description="This record may have been removed or you may not have access." action={<Button variant="outline" onClick={onBack}>Back to staff</Button>} />
      </>
    );
  }

  const name = `${s.firstName} ${s.lastName}`;
  const periodLabel = PERIODS.find((p) => p.value === period)!.label;
  const apptTotal = stats ? stats.statusBreakdown.reduce((n, r) => n + r.count, 0) : 0;
  const pctOf = (n: number) => (apptTotal > 0 ? `${Math.round((n / apptTotal) * 100)}% of ${apptTotal} booked` : periodLabel);
  const completionHint = stats ? pctOf(stats.stats.appointmentsCompleted) : periodLabel;
  const noShowHint = stats ? pctOf(stats.stats.noShows) : periodLabel;

  return (
    <>
      <PageBreadcrumb items={[{ label: "Staff", onClick: onBack }, { label: name }]} />
      <div className="space-y-5">
        <Tabs defaultValue="overview" className="gap-5">
          {/* ---------- summary + tabs: one card ---------- */}
          <div className="rounded-xl border bg-card shadow-sm">
            <div className="p-4 md:p-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14 rounded-xl">
                    <AvatarFallback className="rounded-xl bg-navy-50 text-base font-semibold text-navy-800">
                      {`${s.firstName[0] ?? ""}${s.lastName[0] ?? ""}`.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight md:text-xl">{name}</h2>
                      <span className="rounded-md bg-navy-50 px-2 py-0.5 font-mono text-xs font-semibold text-navy-800">{s.staffCode}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{s.jobTitle}{s.department ? ` · ${s.department}` : ""}</span>
                      {s.phone ? <span className="flex items-center gap-1"><AtomIcon name="Phone" className="h-3.5 w-3.5" /> {s.phone}</span> : null}
                      {s.email ? <span className="flex items-center gap-1"><AtomIcon name="Mail" className="h-3.5 w-3.5" /> {s.email}</span> : null}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={s.employmentStatus} />
                      <Badge variant="outline" className={STAFF_ROLE_TONES[s.staffRole] || ""}>{labelize(s.staffRole)}</Badge>
                      {s.isTherapist ? <Badge variant="outline" className="border-teal-200 bg-teal-50 text-teal-700">Therapist</Badge> : null}
                      <Badge variant="outline" className={data.account ? (data.account.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700") : "border-slate-200 bg-slate-100 text-slate-600"}>
                        {data.account ? (data.account.active ? "Login active" : "Login deactivated") : "No login"}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {canManage ? (
                    <Button onClick={openEdit}>
                      <AtomIcon name="Pencil" className="mr-2 h-4 w-4" /> Edit profile
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <UnderlineTabsList className="border-0 px-4 md:px-6">
              <UnderlineTabsTrigger value="overview"><AtomIcon name="User" className="h-4 w-4" />Overview</UnderlineTabsTrigger>
              {s.isTherapist ? (
                <UnderlineTabsTrigger value="patients">
                  <AtomIcon name="Users" className="h-4 w-4" />Patients{patientCountQ.data ? ` (${patientCountQ.data.total})` : ""}
                </UnderlineTabsTrigger>
              ) : null}
              {s.isTherapist ? <UnderlineTabsTrigger value="workload"><AtomIcon name="Activity" className="h-4 w-4" />Workload</UnderlineTabsTrigger> : null}
              <UnderlineTabsTrigger value="remuneration"><AtomIcon name="Wallet" className="h-4 w-4" />Remuneration</UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="account"><AtomIcon name="ShieldCheck" className="h-4 w-4" />Login account</UnderlineTabsTrigger>
            </UnderlineTabsList>
          </div>

          {/* ============ OVERVIEW ============ */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {s.isTherapist ? (
                <>
                  <StatCard label="Active episodes" value={data.stats.activeEpisodes} icon="GitBranch" tone="navy" />
                  <StatCard label="Completed sessions" value={data.stats.completedSessions} icon="Activity" tone="teal" hint="all time" />
                  <StatCard label="Unique patients" value={data.stats.uniquePatients} icon="Users" tone="sky" hint="all time" />
                </>
              ) : (
                <StatCard label="Role" value={labelize(s.staffRole)} icon="BadgeCheck" tone="navy" />
              )}
              <StatCard label="Employed since" value={s.employmentDate ? formatDate(s.employmentDate) : "—"} icon="CalendarDays" tone="emerald" />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="Employment details" icon="Briefcase" className="flex-1">
                <DetailGrid cols={1}>
                  <DetailRow label="Full name" value={name} />
                  <DetailRow label="Staff ID" value={<span className="font-mono text-xs">{s.staffCode}</span>} />
                  <DetailRow label="Job title" value={s.jobTitle} />
                  <DetailRow label="Department" value={s.department} />
                  <DetailRow label="Role" value={<Badge variant="outline" className={STAFF_ROLE_TONES[s.staffRole] || ""}>{labelize(s.staffRole)}</Badge>} />
                  <DetailRow label="Status" value={<StatusBadge status={s.employmentStatus} />} />
                  <DetailRow label="Branch" value={data.branchName} />
                  <DetailRow label="Employed since" value={s.employmentDate ? formatDate(s.employmentDate) : undefined} />
                  <DetailRow label="Email" value={s.email} />
                  <DetailRow label="Phone" value={s.phone} />
                  <DetailRow label="Therapist" value={s.isTherapist ? "Yes — workload tracked" : "No"} />
                </DetailGrid>
              </SectionCard>

              <div className="flex flex-col gap-4">
                <SectionCard title="Qualifications" icon="GraduationCap">
                  {s.professionalDesignation || s.specialization || s.qualifications.length > 0 ? (
                    <div className="space-y-2">
                      {s.professionalDesignation ? <p className="text-sm"><span className="text-muted-foreground">Designation:</span> {s.professionalDesignation}</p> : null}
                      {s.specialization ? <p className="text-sm"><span className="text-muted-foreground">Specialization:</span> {s.specialization}</p> : null}
                      {s.qualifications.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5">
                          {s.qualifications.map((q, i) => <Badge key={i} variant="outline" className="bg-muted/50 font-normal">{q}</Badge>)}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No qualifications recorded.</p>
                  )}
                </SectionCard>

                <SectionCard title="Availability" icon="Clock" className="flex-1">
                  {s.availability.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {s.availability.map((a, i) => (
                        <Badge key={i} variant="outline" className="border-teal-200 bg-teal-50 font-normal text-teal-700">
                          {a.day} {a.start || ""}{a.end ? `–${a.end}` : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No availability set.</p>
                  )}
                </SectionCard>
              </div>
            </div>
          </TabsContent>

          {/* ============ PATIENTS (clients of this therapist) ============ */}
          {s.isTherapist ? (
            <TabsContent value="patients">
              <StaffPatientsTab staffId={staffId} staffName={name} />
            </TabsContent>
          ) : null}

          {/* ============ WORKLOAD ============ */}
          {s.isTherapist ? (
            <TabsContent value="workload" className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">Completed sessions only count towards workload.</p>
                <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                  <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Sessions" value={stats?.stats.completedSessions ?? 0} icon="Activity" tone="teal" hint={periodLabel} loading={!stats} />
                <StatCard label="Unique patients" value={stats?.stats.uniquePatients ?? 0} icon="Users" tone="sky" hint={periodLabel} loading={!stats} />
                <StatCard label="Active episodes" value={stats?.stats.activeEpisodes ?? 0} icon="GitBranch" tone="navy" loading={!stats} />
                <StatCard label="Appts completed" value={stats?.stats.appointmentsCompleted ?? 0} icon="CheckCircle2" tone="emerald" hint={completionHint} loading={!stats} />
                <StatCard label="No-shows" value={stats?.stats.noShows ?? 0} icon="UserX" tone="rose" hint={noShowHint} loading={!stats} />
                <StatCard label="Upcoming" value={stats?.stats.upcomingAppointments ?? 0} icon="Clock" tone="amber" loading={!stats} />
              </div>
              <SectionCard
                title="Activity — last 6 months"
                icon="BarChart3"
                description="Switch metrics on and off with the chips above the chart"
              >
                {!stats ? (
                  <Skeleton className="h-72 w-full" />
                ) : (
                  <ReportBarChart
                    data={stats.monthly}
                    xKey="month"
                    height={260}
                    series={[
                      { key: "sessions", name: "Sessions completed", color: "#0e9f8a" },
                      { key: "patients", name: "Unique patients", color: "#123c66" },
                      { key: "booked", name: "Appointments booked", color: "#0ea5e9" },
                      { key: "noShows", name: "No-shows", color: "#ef4444" },
                      { key: "cancelled", name: "Cancelled", color: "#f59e0b" },
                    ]}
                    defaultHidden={["cancelled"]}
                  />
                )}
              </SectionCard>

              <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="Appointment outcomes" icon="PieChart" description={periodLabel}>
                  {!stats ? (
                    <Skeleton className="h-52 w-full" />
                  ) : stats.statusBreakdown.length === 0 ? (
                    <p className="py-10 text-center text-sm text-muted-foreground">No appointments in this period.</p>
                  ) : (
                    <ReportDonut
                      data={stats.statusBreakdown.map((r) => ({ name: r.status, value: r.count }))}
                      formatName={labelize}
                      centreLabel="Appointments"
                    />
                  )}
                </SectionCard>
                <SectionCard title="Busiest days" icon="CalendarDays" description={`Completed sessions by weekday · ${periodLabel}`}>
                  {!stats ? (
                    <Skeleton className="h-52 w-full" />
                  ) : (
                    <ReportBarChart
                      data={stats.byWeekday}
                      xKey="day"
                      height={208}
                      series={[{ key: "sessions", name: "Sessions", color: "#0e9f8a" }]}
                    />
                  )}
                </SectionCard>
              </div>
            </TabsContent>
          ) : null}

          {/* ============ REMUNERATION ============ */}
          <TabsContent value="remuneration" className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <SectionCard title="Pay" icon="Wallet">
                {canManage ? (
                  <div className="space-y-3">
                    {s.isTherapist ? (
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Method</Label>
                        <Select value={method} onValueChange={setMethod}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REMUNERATION_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m === "FIXED" ? "Fixed monthly salary" : m === "PER_PATIENT" ? "Per unique patient" : "Per completed session"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {effMethod === "FIXED" ? "Monthly salary (GHS)" : `Rate (GHS ${effMethod === "PER_SESSION" ? "per session" : "per unique patient"})`}
                      </Label>
                      <Input type="number" min="0" step="0.01" value={rateGhs} onChange={(e) => setRateGhs(e.target.value)} placeholder="0.00" />
                    </div>
                    <Button size="sm" onClick={() => void saveRemuneration()} disabled={savingRem}>
                      {savingRem ? "Saving…" : "Save"}
                    </Button>
                  </div>
                ) : (
                  <DetailGrid cols={1}>
                    <DetailRow label="Method" value={s.remunerationMethod === "FIXED" ? "Fixed monthly salary" : labelize(s.remunerationMethod)} />
                    <DetailRow label={s.remunerationMethod === "FIXED" ? "Monthly salary" : "Rate"} value={s.remunerationRateCents ? formatMoney(s.remunerationRateCents) : undefined} />
                  </DetailGrid>
                )}
              </SectionCard>

              <SectionCard title="Computed remuneration" icon="Calculator" description={periodLabel}>
                <div className="mb-3 flex justify-end">
                  <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
                    <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!stats ? (
                  <Skeleton className="h-16 w-full" />
                ) : stats.remuneration.computedCents !== null ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
                    <span className="text-sm text-muted-foreground">
                      {stats.remuneration.method === "FIXED"
                        ? `${formatMoney(stats.remuneration.rateCents ?? 0)} / month, pro-rated by days`
                        : `${stats.stats.completedSessions} sessions · ${stats.stats.uniquePatients} unique patients`}
                    </span>
                    <span className="text-xl font-semibold text-navy-800">{formatMoney(stats.remuneration.computedCents)}</span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No pay rate recorded yet{canManage ? " — set it on the left." : "."}</p>
                )}
              </SectionCard>
            </div>
          </TabsContent>

          {/* ============ LOGIN ACCOUNT ============ */}
          <TabsContent value="account" className="space-y-4">
            <SectionCard title="Login account" icon="ShieldCheck">
              {data.account ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{data.account.email}</p>
                      <p className="text-xs text-muted-foreground">{data.account.roleName}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{data.account.active ? "Active" : "Inactive"}</span>
                      <Switch checked={data.account.active} onCheckedChange={(v) => void toggleAccount(v)} disabled={!canManageUsers && !canManage} />
                    </div>
                  </div>
                  {!data.account.active ? <p className="text-xs text-amber-600">Deactivated users cannot sign in until reactivated.</p> : null}
                  {canManageUsers ? (
                    resetOpen ? (
                      <div className="flex w-full max-w-md items-center gap-2">
                        <Input type="password" placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                        <Button size="sm" onClick={() => void resetPassword()} disabled={busy}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setResetOpen(false); setNewPassword(""); }}>Cancel</Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
                        <AtomIcon name="KeyRound" className="mr-1.5 h-3.5 w-3.5" /> Reset password
                      </Button>
                    )
                  ) : null}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">No login account linked to this staff profile.</p>
                  {canManageUsers ? (
                    <Button size="sm" variant="outline" onClick={() => { setCreateEmail(s.email || ""); setCreateRoleId(""); setCreateOpen(true); }}>
                      <AtomIcon name="UserPlus" className="mr-1.5 h-3.5 w-3.5" /> Create account
                    </Button>
                  ) : null}
                </div>
              )}
            </SectionCard>
          </TabsContent>
        </Tabs>
      </div>

      <StaffFormDialog open={!!editTarget} target={editTarget} onClose={() => setEditTarget(null)} />

      <Dialog open={createOpen} onOpenChange={(v) => (!v ? setCreateOpen(false) : null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create login account</DialogTitle>
            <DialogDescription>Links the new user to {name}.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</Label>
              <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="user@gmrsphysio.com.gh" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Initial password</Label>
              <Input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Min 8 characters" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Role</Label>
              <Select value={createRoleId} onValueChange={setCreateRoleId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>
                  {(rolesQ.data?.items || []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => void createAccount()} disabled={busy}>{busy ? "Creating…" : "Create account"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
