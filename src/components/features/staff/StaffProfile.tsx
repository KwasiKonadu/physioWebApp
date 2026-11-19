"use client";
// ============ Staff profile: summary card + tabs (overview, workload, remuneration, login account) ============
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { PERMS, labelize } from "@/lib/constants";
import { toCents } from "@/lib/format";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, UnderlineTabsList, UnderlineTabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import StaffFormDialog, { type StaffFormTarget } from "./staff-form-dialog";
import { STAFF_ROLE_TONES } from "./StaffCard";
import StaffPatientsTab from "./StaffPatientsTab";
import { StaffDetail, StatsResponse, PERIODS, Period, periodRange } from "./staff-profile-model";
import { StaffOverviewTab } from "./StaffOverviewTab";
import { StaffWorkloadTab } from "./StaffWorkloadTab";
import { StaffRemunerationTab } from "./StaffRemunerationTab";
import { StaffAccountTab } from "./StaffAccountTab";
import { StaffLeaveTab } from "./StaffLeaveTab";
import { Field } from "@/components/molecules/field";
import { PasswordInput } from "@/components/molecules/password-input";

export default function StaffProfile({ staffId, onBack }: { staffId: string; onBack: () => void }) {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.staffManage);
  const canViewStaff = hasPermission(user, PERMS.staffView);
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
      <PageBreadcrumb items={canViewStaff ? [{ label: "Staff", onClick: onBack }, { label: name }] : [{ label: "My profile" }]} />
      <div className="space-y-5">
        <Tabs defaultValue="overview" className="gap-5">
          {/* ---------- summary + tabs: one card ---------- */}
          <div className="rounded-lg border bg-card">
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
                      <span className="code-chip">{s.staffCode}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>{s.jobTitle}{s.department ? ` · ${s.department}` : ""}</span>
                      {s.phone ? <span className="flex items-center gap-1"><AtomIcon name="Phone" className="h-3.5 w-3.5" /> {s.phone}</span> : null}
                      {s.email ? <span className="flex items-center gap-1"><AtomIcon name="Mail" className="h-3.5 w-3.5" /> {s.email}</span> : null}
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={s.employmentStatus} />
                      <Badge variant="outline" className={STAFF_ROLE_TONES[s.staffRole] || ""}>{labelize(s.staffRole)}</Badge>
                      {s.isTherapist ? <Badge variant="outline" className="border-navy-200 bg-navy-50 text-navy-800">Therapist</Badge> : null}
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
              <UnderlineTabsTrigger value="leave"><AtomIcon name="CalendarOff" className="h-4 w-4" />Leave</UnderlineTabsTrigger>
              <UnderlineTabsTrigger value="account"><AtomIcon name="ShieldCheck" className="h-4 w-4" />Login account</UnderlineTabsTrigger>
            </UnderlineTabsList>
          </div>

          {/* ============ OVERVIEW ============ */}
          <StaffOverviewTab data={data} s={s} stats={stats} name={name} />

          {/* ============ PATIENTS (clients of this therapist) ============ */}
          {s.isTherapist ? (
            <TabsContent value="patients">
              <StaffPatientsTab staffId={staffId} staffName={name} />
            </TabsContent>
          ) : null}

          {/* ============ WORKLOAD ============ */}
          {s.isTherapist ? (
            <StaffWorkloadTab data={data} stats={stats} name={name} period={period} setPeriod={setPeriod} periodLabel={periodLabel} completionHint={completionHint} noShowHint={noShowHint} />
          ) : null}

          {/* ============ REMUNERATION ============ */}
          <StaffRemunerationTab s={s} stats={stats} period={period} setPeriod={setPeriod} periodLabel={periodLabel} canManage={canManage} effMethod={effMethod} method={method} rateGhs={rateGhs} savingRem={savingRem} saveRemuneration={saveRemuneration} setMethod={setMethod} setRateGhs={setRateGhs} />

          <TabsContent value="leave"><StaffLeaveTab canManage={canManage} staffId={staffId} /></TabsContent>

          {/* ============ LOGIN ACCOUNT ============ */}
          <StaffAccountTab data={data} s={s} name={name} canManage={canManage} canManageUsers={canManageUsers} busy={busy} newPassword={newPassword} resetOpen={resetOpen} resetPassword={resetPassword} toggleAccount={toggleAccount} setCreateEmail={setCreateEmail} setCreateRoleId={setCreateRoleId} setNewPassword={setNewPassword} setCreateOpen={setCreateOpen} setResetOpen={setResetOpen} />
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
            <Field label="Email">
              <Input value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="user@gmrsphysio.com.gh" />
            </Field>
            <Field label="Initial password">
              <PasswordInput value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Min 8 characters" />
            </Field>
            <Field label="Role">
              <Select value={createRoleId} onValueChange={setCreateRoleId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                <SelectContent>
                  {(rolesQ.data?.items || []).map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
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
