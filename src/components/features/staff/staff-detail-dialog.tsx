"use client";
// FEATURE: Staff detail dialog — profile, clinical extras, remuneration editor, workload, account
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { PERMS, labelize } from "@/lib/constants";
import { formatMoney, formatDate, toCents } from "@/lib/format";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { SectionCard } from "@/components/molecules/section-card";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Bar, BarChart, ResponsiveContainer, Tooltip as ReTooltip, XAxis, YAxis } from "recharts";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { REMUNERATION_METHODS } from "@/lib/constants";

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
}

interface Props {
  staffId: string | null;
  open: boolean;
  onClose: () => void;
  onEdit: () => void;
}

const ROLE_TONES: Record<string, string> = {
  ADMIN: "bg-navy-50 text-navy-800 border-navy-200",
  PHYSIOTHERAPIST: "bg-teal-50 text-teal-700 border-teal-200",
  RECEPTIONIST: "bg-sky-50 text-sky-700 border-sky-200",
  MANAGEMENT: "bg-amber-50 text-amber-700 border-amber-200",
};

export default function StaffDetailDialog({ staffId, open, onClose, onEdit }: Props) {
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.staffManage);
  const canManageUsers = hasPermission(user, PERMS.settingsManage);
  const qc = useQueryClient();

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

  const { data, isLoading } = useQuery({
    queryKey: ["staff", "detail", staffId],
    queryFn: () => apiFetch<StaffDetail>(`/api/staff/${staffId}`),
    enabled: open && !!staffId,
  });

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { data: stats } = useQuery({
    queryKey: ["staff", "stats", staffId, monthStart],
    queryFn: () => apiFetch<StatsResponse>(`/api/staff/${staffId}/stats?from=${monthStart}`),
    enabled: open && !!staffId && !!data?.staff.isTherapist,
  });

  const { data: rolesData } = useQuery({
    queryKey: ["roles"],
    queryFn: () => apiFetch<{ items: { id: string; name: string }[] }>("/api/roles"),
    enabled: open && createOpen && canManageUsers,
  });

  useEffect(() => {
    if (data?.staff) {
      setMethod(data.staff.remunerationMethod);
      setRateGhs(data.staff.remunerationRateCents ? String(data.staff.remunerationRateCents / 100) : "");
    }
  }, [data?.staff]);

  const s = data?.staff;

  const saveRemuneration = async () => {
    if (!staffId) return;
    setSavingRem(true);
    try {
      await apiFetch(`/api/staff/${staffId}`, {
        method: "PATCH",
        json: {
          remunerationMethod: method,
          remunerationRateCents: method === "FIXED" ? null : toCents(parseFloat(rateGhs || "0")),
        },
      });
      toast.success("Remuneration updated");
      await qc.invalidateQueries({ queryKey: ["staff"] });
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
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update account");
    }
  };

  const resetPassword = async () => {
    if (!data?.account) return;
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
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
    if (!createEmail.includes("@")) {
      toast.error("Enter a valid email");
      return;
    }
    if (createPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!createRoleId) {
      toast.error("Choose a role");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/users", {
        method: "POST",
        json: { email: createEmail, name: `${s.firstName} ${s.lastName}`, password: createPassword, roleId: createRoleId, staffId: s.id },
      });
      toast.success("Login account created");
      setCreateOpen(false);
      setCreatePassword("");
      await qc.invalidateQueries({ queryKey: ["staff"] });
      await qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create account");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto custom-scrollbar sm:max-w-3xl">
        <DialogHeader>
          {isLoading || !s ? (
            <div className="flex items-center gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3 pr-8">
              <Avatar className="h-11 w-11">
                <AvatarFallback className="bg-navy-100 text-navy-800">
                  {(s.firstName[0] + s.lastName[0]).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                  {s.firstName} {s.lastName}
                  <span className="text-xs font-normal text-muted-foreground">{s.staffCode}</span>
                </DialogTitle>
                <DialogDescription className="flex flex-wrap items-center gap-2">
                  <span>{s.jobTitle}</span>
                  <Badge variant="outline" className={ROLE_TONES[s.staffRole]}>{labelize(s.staffRole)}</Badge>
                  <StatusBadge status={s.employmentStatus} />
                </DialogDescription>
              </div>
            </div>
          )}
        </DialogHeader>

        {isLoading || !s ? (
          <div className="space-y-3 pb-2">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Profile */}
            <SectionCard title="Profile" icon="User" contentClassName="pt-2">
              <DetailGrid>
                <DetailRow label="Email" value={s.email || "—"} />
                <DetailRow label="Phone" value={s.phone || "—"} />
                <DetailRow label="Department" value={s.department || "—"} />
                <DetailRow label="Branch" value={data?.branchName || "—"} />
                <DetailRow label="Employed since" value={s.employmentDate ? formatDate(s.employmentDate) : "—"} />
                <DetailRow label="Therapist" value={s.isTherapist ? "Yes — workload tracked" : "No"} />
              </DetailGrid>
              {(s.qualifications.length > 0 || s.specialization || s.professionalDesignation) && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  {s.professionalDesignation && (
                    <p className="text-sm"><span className="text-muted-foreground">Designation:</span> {s.professionalDesignation}</p>
                  )}
                  {s.specialization && (
                    <p className="text-sm"><span className="text-muted-foreground">Specialization:</span> {s.specialization}</p>
                  )}
                  {s.qualifications.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {s.qualifications.map((q, i) => (
                        <Badge key={i} variant="outline" className="bg-muted/50 font-normal">{q}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {s.availability.length > 0 && (
                <div className="mt-3 border-t pt-3">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Availability</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.availability.map((a, i) => (
                      <Badge key={i} variant="outline" className="bg-teal-50 text-teal-700 border-teal-200 font-normal">
                        {a.day} {a.start || ""}{a.end ? `–${a.end}` : ""}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </SectionCard>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Remuneration (therapists, editable by managers) */}
              {s.isTherapist && (
                <SectionCard title="Remuneration" icon="Wallet" contentClassName="pt-2">
                  {canManage ? (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Method</Label>
                        <Select value={method} onValueChange={setMethod}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REMUNERATION_METHODS.map((m) => (
                              <SelectItem key={m} value={m}>
                                {m === "FIXED" ? "Fixed salary" : m === "PER_PATIENT" ? "Per unique patient" : "Per completed session"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {method !== "FIXED" && (
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Rate (GHS {method === "PER_SESSION" ? "per session" : "per unique patient"})
                          </Label>
                          <Input type="number" min="0" step="0.01" value={rateGhs} onChange={(e) => setRateGhs(e.target.value)} />
                        </div>
                      )}
                      <Button size="sm" onClick={() => void saveRemuneration()} disabled={savingRem}>
                        {savingRem ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-1 text-sm">
                      <p><span className="text-muted-foreground">Method:</span> {labelize(s.remunerationMethod)}</p>
                      <p><span className="text-muted-foreground">Rate:</span> {s.remunerationRateCents ? formatMoney(s.remunerationRateCents) : "—"}</p>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Workload (therapists) */}
              {s.isTherapist && (
                <SectionCard title="Workload — this month" icon="Activity" contentClassName="pt-2">
                  {!stats ? (
                    <Skeleton className="h-32 w-full" />
                  ) : (
                    <div className="space-y-3">
                      <div className="grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-navy-50 p-2">
                          <p className="text-lg font-bold text-navy-800">{stats.stats.completedSessions}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sessions</p>
                        </div>
                        <div className="rounded-lg bg-teal-50 p-2">
                          <p className="text-lg font-bold text-teal-700">{stats.stats.uniquePatients}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Unique patients</p>
                        </div>
                        <div className="rounded-lg bg-sky-50 p-2">
                          <p className="text-lg font-bold text-sky-700">{stats.stats.activeEpisodes}</p>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Episodes</p>
                        </div>
                      </div>
                      {stats.remuneration.computedCents !== null && (
                        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2">
                          <span className="text-xs text-muted-foreground">Computed remuneration</span>
                          <span className="font-semibold text-navy-800">{formatMoney(stats.remuneration.computedCents)}</span>
                        </div>
                      )}
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={stats.trend}>
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                            <ReTooltip />
                            <Bar dataKey="sessions" fill="#0e9f8a" radius={[3, 3, 0, 0]} name="Completed sessions" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </SectionCard>
              )}

              {/* Account */}
              <SectionCard
                title="Login account"
                icon="ShieldCheck"
                className={s.isTherapist ? "" : "lg:col-span-2"}
                contentClassName="pt-2"
              >
                {data?.account ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{data.account.email}</p>
                        <p className="text-xs text-muted-foreground">{data.account.roleName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{data.account.active ? "Active" : "Inactive"}</span>
                        <Switch checked={data.account.active} onCheckedChange={(v) => void toggleAccount(v)} />
                      </div>
                    </div>
                    {canManageUsers && (
                      <div className="flex items-center gap-2">
                        {resetOpen ? (
                          <div className="flex w-full items-center gap-2">
                            <Input
                              type="password"
                              placeholder="New password (min 8 chars)"
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                            />
                            <Button size="sm" onClick={() => void resetPassword()} disabled={busy}>Save</Button>
                            <Button size="sm" variant="ghost" onClick={() => { setResetOpen(false); setNewPassword(""); }}>Cancel</Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
                            <AtomIcon name="KeyRound" className="mr-1.5 h-3.5 w-3.5" /> Reset password
                          </Button>
                        )}
                      </div>
                    )}
                    {!data.account.active && (
                      <p className="text-xs text-amber-600">Deactivated users cannot sign in until reactivated.</p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">No login account linked to this staff profile.</p>
                    {canManageUsers && (
                      <Button size="sm" variant="outline" onClick={() => { setCreateEmail(s.email || ""); setCreateRoleId(""); setCreateOpen(true); }}>
                        <AtomIcon name="UserPlus" className="mr-1.5 h-3.5 w-3.5" /> Create account
                      </Button>
                    )}
                  </div>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        <DialogFooter className="pt-1">
          {canManage && (
            <Button variant="outline" onClick={onEdit}>
              <AtomIcon name="Pencil" className="mr-1.5 h-3.5 w-3.5" /> Edit profile
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    {/* Create account sub-dialog (rendered as a sibling so Radix dialogs don't nest) */}
    <Dialog open={createOpen} onOpenChange={(v) => (!v ? setCreateOpen(false) : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create login account</DialogTitle>
          <DialogDescription>Links the new user to {s?.firstName} {s?.lastName}.</DialogDescription>
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
              <SelectTrigger><SelectValue placeholder="Choose a role" /></SelectTrigger>
              <SelectContent>
                {(rolesData?.items || []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
          <Button onClick={() => void createAccount()} disabled={busy} className="bg-navy-800 hover:bg-navy-900">
            {busy ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
