"use client";
// Sessions list: filters, stat cards and the sessions table.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";

import { formatDate, minutesToTime } from "@/lib/format";
import { PERMS, SESSION_STATUSES, labelize } from "@/lib/constants";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { Badge } from "@/components/ui/badge";


import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";


import { SessionListItem, SessionsListResponse, useTherapists, PainBadge, ReviewProgress } from "./session-list-shared";
import { NewSessionDialog } from "./NewSessionDialog";

// ---- Sessions list ----
export function SessionsList({ onOpen, episodeFilter, onClearEpisodeFilter }: {
  onOpen: (sessionId: string) => void;
  episodeFilter: string | null;
  onClearEpisodeFilter: () => void;
}) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [status, setStatus] = useState("all");
  const [therapistId, setTherapistId] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [createOpen, setCreateOpen] = useState(false);

  const therapistsQuery = useTherapists();

  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (status !== "all") params.set("status", status);
  if (therapistId !== "all") params.set("therapistId", therapistId);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (episodeFilter) params.set("episodeId", episodeFilter);

  const listQuery = useQuery({
    queryKey: ["sessions", status, therapistId, from, to, episodeFilter, page, pageSize],
    queryFn: () => apiFetch<SessionsListResponse>(`/api/sessions?${params.toString()}`),
    placeholderData: (prev) => prev,
  });

  const items = useMemo(() => {
    const raw = listQuery.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter((s) => {
      const p = s.episode.patient;
      return `${p.firstName} ${p.lastName} ${p.patientCode}`.toLowerCase().includes(q);
    });
  }, [listQuery.data, search]);

  const stats = listQuery.data?.stats;

  return (
    <div>
      <PageHeader
        title="Therapy Sessions"
        description="Document delivered treatments, track progress-review counters and package deductions."
        icon="Activity"
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Completed (filtered range)" value={stats?.completed ?? 0} icon="CheckCircle2" tone="emerald" loading={!listQuery.data} />
        <StatCard label="Planned / active" value={stats?.planned ?? 0} icon="CalendarClock" tone="sky" loading={!listQuery.data} />
        <StatCard label="Today" value={stats?.today ?? 0} icon="Clock" tone="teal" loading={!listQuery.data} hint="Excludes cancellations & no-shows" />
      </div>

      {episodeFilter ? (
        <div className="mb-3 flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Filtered by episode</span>
          <Badge variant="outline" className="gap-1 bg-teal-50 text-teal-700">
            <AtomIcon name="Layers" className="h-3 w-3" /> {episodeFilter.slice(0, 10)}…
          </Badge>
          <Button variant="ghost" size="sm" onClick={onClearEpisodeFilter}>
            <AtomIcon name="X" className="h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      ) : null}

      <div className="mb-3">
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search patient name / code…" }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["sessions"] })}
          refreshing={listQuery.isFetching}
          filters={
            <>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-37.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {SESSION_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={therapistId} onValueChange={(v) => { setTherapistId(v); setPage(1); }}>
                <SelectTrigger className="w-42.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All therapists</SelectItem>
                  {(therapistsQuery.data ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-35" aria-label="From date" />
                <span className="text-xs text-muted-foreground">→</span>
                <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-35" aria-label="To date" />
              </div>
            </>
          }
        >
          {canManage ? (
            <Button onClick={() => setCreateOpen(true)} className="bg-teal-600 hover:bg-teal-700">
              <AtomIcon name="Plus" className="h-4 w-4" /> New session
            </Button>
          ) : null}
        </DataToolbar>
      </div>
      {listQuery.isError ? (
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <EmptyState
            icon="AlertTriangle"
            title="Could not load sessions"
            description={(listQuery.error as Error)?.message || "Please try again."}
            action={<Button variant="outline" onClick={() => qc.invalidateQueries({ queryKey: ["sessions"] })}>Retry</Button>}
          />
        </div>
      ) : (
        <DataTable
          rows={items}
          rowKey={(s: SessionListItem) => s.id}
          loading={listQuery.isLoading}
          loadingRows={5}
          minWidth="min-w-200"
          onRowClick={(s) => onOpen(s.id)}
          empty={
            <EmptyState
              icon="Activity"
              title="No sessions found"
              description="Sessions appear here once scheduled or created manually. Adjust the filters to widen your search."
              action={canManage ? <Button variant="outline" onClick={() => setCreateOpen(true)}>Create a session</Button> : undefined}
            />
          }
          pagination={{ page: listQuery.data?.page ?? page, pageSize, total: listQuery.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (size) => { setPageSize(size); setPage(1); } }}
          columns={[
            {
              id: "when", header: "Date / time",
              cell: (s) => (
                <>
                  <p className="text-sm font-medium">{formatDate(s.date)}</p>
                  <p className="text-xs text-muted-foreground">{minutesToTime(s.timeMin)}</p>
                </>
              ),
            },
            {
              id: "patient", header: "Patient",
              cell: (s) => (
                <>
                  <p className="text-sm font-medium">{s.episode.patient.firstName} {s.episode.patient.lastName}</p>
                  <p className="font-mono text-xs text-muted-foreground">{s.episode.patient.patientCode}</p>
                </>
              ),
            },
            {
              id: "episode", header: "Episode", hideBelow: "md", className: "max-w-55",
              cell: (s) => (
                <>
                  <p className="truncate text-sm" title={s.episode.title}>{s.episode.title}</p>
                  {s.interventions.length ? <p className="truncate text-xs text-muted-foreground">{s.interventions.map((i) => i.name).join(", ")}</p> : null}
                </>
              ),
            },
            { id: "therapist", header: "Therapist", hideBelow: "lg", cell: (s) => <span className="text-sm">{s.therapist ? `${s.therapist.firstName} ${s.therapist.lastName}` : "—"}</span> },
            { id: "pain", header: "Pain", hideBelow: "sm", cell: (s) => <PainBadge level={s.painLevel} /> },
            { id: "duration", header: "Duration", hideBelow: "sm", cell: (s) => <span className="text-sm">{s.durationMin ? `${s.durationMin} min` : "—"}</span> },
            { id: "review", header: "Review progress", hideBelow: "xl", cell: (s) => <ReviewProgress since={s.episode.sessionsSinceReview} threshold={s.episode.reviewThreshold} due={s.episode.reviewDue} /> },
            { id: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
            {
              id: "actions", header: "Actions", align: "right",
              cell: (s) => {
                const active = s.status === "PLANNED" || s.status === "IN_PROGRESS";
                return active ? (
                  <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); onOpen(s.id); }}>
                    <AtomIcon name="PenLine" className="h-3.5 w-3.5" /> Document
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onOpen(s.id); }}>
                    <AtomIcon name="Eye" className="h-3.5 w-3.5" /> View
                  </Button>
                );
              },
            },
          ]}
        />
      )}

      <NewSessionDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={onOpen} />
    </div>
  );
}
