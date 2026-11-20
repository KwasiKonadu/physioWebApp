"use client";
// Staff page: leave management tab — requests list, approve / reject, new request panel.
import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS, LEAVE_STATUSES, labelize } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { Field } from "@/components/molecules/field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStaffOptions } from "./use-staff-options";
import { useUrlState } from "@/hooks/use-url-state";

interface LeaveItem {
  id: string; staffId: string; staffName: string; staffCode: string; jobTitle: string;
  type: string; startDate: string; endDate: string; days: number; reason: string | null;
  status: string; decisionNote: string | null;
}
interface LeaveResponse {
  items: LeaveItem[]; total: number; page: number; pageSize: number; myStaffId: string | null;
  summary: { pending: number; upcomingApproved: number };
}

const EMPTY = { staffId: "", type: "ANNUAL", startDate: "", endDate: "", reason: "" };

export function StaffLeaveTab({ canManage, staffId }: { canManage: boolean; /** scope the list to one person (their profile page) */ staffId?: string }) {
  const qc = useQueryClient();
  const [status, setStatus] = useUrlState("lv_status", "ALL");
  const [page, setPage] = useUrlState("lv_page", 1);
  const [pageSize, setPageSize] = useUrlState("lv_size", 10);
  const [open, setOpen] = useState(false);
  // "self": the logged-in employee applying; "other": a manager filing for someone else
  const [mode, setMode] = useState<"self" | "other">("self");
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const staffOptions = useStaffOptions(open && mode === "other");

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status !== "ALL") params.set("status", status);
  if (staffId) params.set("staffId", staffId);
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["staff", "leave", staffId ?? "all", status, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: () => apiFetch<LeaveResponse>(`/api/staff/leave?${params.toString()}`),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ["staff"] });

  const decide = async (id: string, next: "APPROVED" | "REJECTED" | "CANCELLED") => {
    try {
      await apiFetch(`/api/staff/leave/${id}`, { method: "PATCH", json: { status: next } });
      toast.success(`Leave ${next.toLowerCase()}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update leave");
    }
  };

  const submit = async () => {
    if ((mode === "other" && !form.staffId) || !form.startDate || !form.endDate) {
      toast.error(mode === "other" ? "Choose a staff member and the leave dates" : "Choose the leave dates");
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/staff/leave", { method: "POST", json: { ...form, staffId: mode === "other" ? form.staffId : undefined } });
      toast.success(mode === "self" ? "Leave request sent for approval" : "Leave request added");
      setOpen(false);
      setForm(EMPTY);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add leave request");
    } finally {
      setSaving(false);
    }
  };

  const items = data?.items || [];

  return (
    <div className="space-y-4">
      {!staffId ? <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Pending requests" value={data?.summary.pending ?? 0} icon="Hourglass" tone="amber" loading={!data} />
        <StatCard label="Upcoming / current leave" value={data?.summary.upcomingApproved ?? 0} icon="CalendarOff" tone="teal" loading={!data} />
      </div> : null}

      <DataToolbar onRefresh={() => void refetch()} refreshing={isFetching}
        filters={
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="h-9 w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All statuses</SelectItem>
              {LEAVE_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      >
        {canManage && !staffId ? (
          <Button variant={data?.myStaffId ? "outline" : "default"} onClick={() => { setMode("other"); setOpen(true); }}>
            <AtomIcon name="CalendarPlus" className="mr-1.5 h-4 w-4" /> New leave request
          </Button>
        ) : null}
        {data?.myStaffId && (!staffId || staffId === data.myStaffId) ? (
          <Button onClick={() => { setMode("self"); setOpen(true); }}>
            <AtomIcon name="CalendarPlus" className="mr-1.5 h-4 w-4" /> Apply for leave
          </Button>
        ) : null}
      </DataToolbar>

      <DataTable
        rows={items}
        rowKey={(r: LeaveItem) => r.id}
        loading={isLoading}
        minWidth="min-w-220"
        empty={<div className="p-4"><EmptyState icon="CalendarOff" title="No leave requests" description="Leave requests will appear here once they are added." /></div>}
        pagination={{ page, pageSize, total: data?.total || 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
        columns={[
          { id: "staff", header: "Staff", cell: (r) => (
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.staffName}</p>
              <p className="truncate text-xs text-muted-foreground">{r.staffCode} · {r.jobTitle}</p>
            </div>
          ) },
          { id: "type", header: "Type", cell: (r) => <span className="text-sm">{LEAVE_TYPE_LABELS[r.type] ?? labelize(r.type)}</span> },
          { id: "dates", header: "Dates", cell: (r) => <span className="text-sm">{formatDate(r.startDate)} – {formatDate(r.endDate)}</span> },
          { id: "days", header: "Days", align: "center", cell: (r) => <span className="text-sm">{r.days}</span> },
          { id: "reason", header: "Reason", hideBelow: "lg", cell: (r) => <span className="line-clamp-1 text-sm text-muted-foreground">{r.reason || "—"}</span> },
          { id: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
          { id: "actions", header: "Actions", align: "right", cell: (r) => !canManage ? (
            r.status === "PENDING" && r.staffId === data?.myStaffId ? (
              <Button size="sm" variant="outline" onClick={() => void decide(r.id, "CANCELLED")}>Withdraw</Button>
            ) : null
          ) : (
            <div className="flex justify-end gap-1">
              {r.status === "PENDING" ? (
                <>
                  <Button size="sm" onClick={() => void decide(r.id, "APPROVED")}>Approve</Button>
                  <Button size="sm" variant="outline" onClick={() => void decide(r.id, "REJECTED")}>Reject</Button>
                </>
              ) : r.status === "APPROVED" ? (
                <Button size="sm" variant="outline" onClick={() => void decide(r.id, "CANCELLED")}>Cancel</Button>
              ) : null}
            </div>
          ) },
        ]}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{mode === "self" ? "Apply for leave" : "New leave request"}</DialogTitle>
            <DialogDescription>{mode === "self" ? "Your request goes to the administrator for approval." : "Record leave for a staff member. It starts as pending until approved."}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 [&>*]:min-w-0">
            {mode === "other" ? (
            <Field label="Staff member" required>
              <Select value={form.staffId} onValueChange={(v) => setForm({ ...form, staffId: v })}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {staffOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            ) : null}
            <Field label="Leave type" required>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{LEAVE_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <Field label="Start date" required>
                <Input type="date" className="min-w-0" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </Field>
              <Field label="End date" required>
                <Input type="date" className="min-w-0" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </Field>
            </div>
            <Field label="Reason">
              <Textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
          </div>

          <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={saving}>{saving ? "Saving…" : mode === "self" ? "Submit request" : "Add request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
