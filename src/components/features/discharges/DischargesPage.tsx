"use client";
// FEATURE: discharges module — stats, discharge records table, initiation workflow (episode → reason).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { formatDate, fullName } from "@/lib/format";
import { DISCHARGE_REASONS, PERMS, DISCHARGE_STATUSES, labelize } from "@/lib/constants";
import { useAuthStore, hasPermission, useUIStore } from "@/stores/app-store";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { EpisodePickerDialog } from "../progress-reviews/EpisodePickerDialog";
import type { DischargesListResponse, PickerEpisode } from "../progress-reviews/types";

export default function DischargesPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [initiateOpen, setInitiateOpen] = useState(false);
  const [pendingEpisode, setPendingEpisode] = useState<PickerEpisode | null>(null);
  const [reason, setReason] = useState("");

  const listQuery = useQuery({
    queryKey: ["discharges", page, pageSize, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      return apiFetch<DischargesListResponse>(`/api/discharges?${params.toString()}`);
    },
  });

  const initiate = useMutation({
    mutationFn: (opts: { episodeId: string; reason: string }) =>
      apiFetch<{ discharge: { id: string } }>("/api/discharges", { method: "POST", json: { episodeId: opts.episodeId, reason: opts.reason } }),
    onSuccess: (data) => {
      toast.success("Discharge record created");
      qc.invalidateQueries({ queryKey: ["discharges"] });
      qc.invalidateQueries({ queryKey: ["picker-episodes"] });
      if (navEpisodeId) clearOpts();
      router.push(`/discharges/${data.discharge.id}`);
      setPendingEpisode(null);
      setReason("");
    },
    onError: (err: Error) => toast.error(err.message || "Could not initiate discharge"),
  });

  // Cross-module navigation (e.g. review decision DISCHARGE) → open the picker preselected to that episode.
  // Derived from the store (no effect/setState): closing the picker clears navOpts.
  const navEpisodeId = navOpts?.episodeId ?? null;
  const pickerOpen = initiateOpen || !!navEpisodeId;
  const closePicker = (open: boolean) => {
    if (!open) {
      setInitiateOpen(false);
      if (navEpisodeId) clearOpts();
    } else {
      setInitiateOpen(true);
    }
  };

  const data = listQuery.data;
  const stats = data?.stats;
  const items = data?.items || [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Discharges"
        description="Therapist-led discharge records — final assessment, outcomes, home programme and episode closure"
        icon="LogOut"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Draft" value={stats ? stats.draft : "—"} icon="FileEdit" tone="sky" loading={listQuery.isLoading} hint="Records being prepared" />
        <StatCard label="Pending sign-off" value={stats ? stats.pending : "—"} icon="PenLine" tone="amber" loading={listQuery.isLoading} hint="Awaiting therapist signature" />
        <StatCard label="Completed" value={stats ? stats.completed : "—"} icon="CheckCircle2" tone="emerald" loading={listQuery.isLoading} hint="Signed — episodes closed" />
      </div>

      <div className="mb-3">
        <DataToolbar
          filters={
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                {DISCHARGE_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
              </SelectContent>
            </Select>
          }
          onRefresh={() => listQuery.refetch()}
          refreshing={listQuery.isFetching}
        >
          {canManage ? (
            <Button onClick={() => setInitiateOpen(true)}>
              <AtomIcon name="Plus" className="mr-2 h-4 w-4" />
              Initiate discharge
            </Button>
          ) : null}
        </DataToolbar>
      </div>
      <DataTable
        rows={items}
        rowKey={(d) => d.id}
        loading={listQuery.isLoading}
        minWidth="min-w-180"
        onRowClick={(d) => router.push(`/discharges/${d.id}`)}
        empty={
          <EmptyState
            icon="LogOut"
            title="No discharge records"
            description="Initiate a discharge from any open episode — outstanding payments never block the process."
          />
        }
        pagination={{ page: data?.page || page, pageSize: data?.pageSize || pageSize, total: data?.total || 0, onPageChange: setPage }}
        columns={[
          { id: "date", header: "Discharge date", cell: (d) => <span className="font-medium">{formatDate(d.dischargeDate)}</span> },
          {
            id: "patient", header: "Patient",
            cell: (d) => (
              <>
                <p className="font-medium">{fullName(d.patient)}</p>
                <p className="text-xs text-muted-foreground">{d.patient.patientCode}</p>
              </>
            ),
          },
          { id: "episode", header: "Episode", className: "max-w-56 truncate", cell: (d) => d.episode.title },
          { id: "reason", header: "Reason", className: "max-w-56 truncate", cell: (d) => <span className="text-sm text-muted-foreground">{d.reason}</span> },
          { id: "status", header: "Status", cell: (d) => <StatusBadge status={d.status} /> },
          { id: "followup", header: "Follow-up", cell: (d) => <span className="text-sm text-muted-foreground">{d.followUpType ? labelize(d.followUpType) : "—"}</span> },
        ]}
      />

      {/* Initiate: pick an open episode */}
      <EpisodePickerDialog
        open={pickerOpen}
        onOpenChange={closePicker}
        endpoint="/api/discharges/episodes"
        title="Initiate discharge"
        description="Search any open episode — closed episodes cannot be discharged."
        preselectedEpisodeId={navEpisodeId}
        onPicked={(ep) => setPendingEpisode(ep)}
      />

      {/* Confirm: reason + create */}
      <Dialog open={!!pendingEpisode} onOpenChange={(open) => { if (!open) setPendingEpisode(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Start discharge record</DialogTitle>
            <DialogDescription>
              {pendingEpisode
                ? `${fullName(pendingEpisode.patient)} (${pendingEpisode.patient.patientCode || "—"}) · ${pendingEpisode.title}${pendingEpisode.therapist ? ` · therapist ${pendingEpisode.therapist.firstName} ${pendingEpisode.therapist.lastName}` : ""}`
                : "Selected episode could not be resolved — it may already be closed."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Discharge reason</label>
            <Select value={reason || undefined} onValueChange={setReason}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a reason…" /></SelectTrigger>
              <SelectContent>
                {DISCHARGE_REASONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">Outstanding payments do not block discharge — any balance stays visible in billing.</p>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPendingEpisode(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!reason || initiate.isPending}
              onClick={() => pendingEpisode && initiate.mutate({ episodeId: pendingEpisode.id, reason })}
            >
              {initiate.isPending ? "Creating…" : "Create record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
