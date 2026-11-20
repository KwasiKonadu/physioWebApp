"use client";
// Assessments list: search, status filter, stat cards and the assessments table.

import { useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { formatDate, fullName } from "@/lib/format";
import * as API from "./assessments-api";
import type { AssessmentFormTarget } from "./AssessmentForm";
import { useUrlState } from "@/hooks/use-url-state";

// ===================== assessments list =====================
export function AssessmentsList({ canManage, onOpen }: {
  canManage: boolean;
  onOpen: (t: AssessmentFormTarget) => void;
}) {
  const [search, setSearch] = useUrlState("as_q", "");
  const dq = API.useDebounced(search, 300);
  const [statusFilter, setStatusFilter] = useUrlState("as_status", "all");
  const [page, setPage] = useUrlState("as_page", 1);
  const [pageSize, setPageSize] = useUrlState("as_size", 10);

  const listQ = useQuery({
    queryKey: ["assessments", "list", { dq, statusFilter, page, pageSize }],
    placeholderData: keepPreviousData,
    queryFn: () => API.fetchAssessments({
      search: dq || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      page,
      pageSize,
    }),
  });

  // one request feeds both the drafts callout and the KPI cards (clinic-wide counts come back as `stats`)
  const draftsQ = useQuery({
    queryKey: ["assessments", "drafts"],
    queryFn: () => API.fetchAssessments({ status: "DRAFT", page: 1, pageSize: 4, stats: true }),
  });
  const statsQ = { data: draftsQ.data?.stats, isLoading: draftsQ.isLoading };

  const items = listQ.data?.items || [];
  const total = listQ.data?.total || 0;
  const hasFilters = !!(dq || statusFilter !== "all");

  return (
    <div className="space-y-4">
      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total assessments" value={statsQ.data?.total ?? "—"} icon="ClipboardList" tone="navy" loading={statsQ.isLoading} />
        <StatCard label="Drafts awaiting completion" value={statsQ.data?.drafts ?? "—"} icon="ClipboardPen" tone="amber" loading={statsQ.isLoading} />
        <StatCard label="Completed" value={statsQ.data?.completed ?? "—"} icon="CheckCircle2" tone="teal" loading={statsQ.isLoading} />
      </div>

      {/* pending drafts callout */}
      {draftsQ.data && draftsQ.data.total > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <AtomIcon name="ClipboardPen" className="h-4 w-4" />
            {draftsQ.data.total} draft assessment{draftsQ.data.total === 1 ? "" : "s"} awaiting completion
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {draftsQ.data.items.map((d) => (
              <Button
                key={d.id}
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => onOpen({ assessmentId: d.id })}
              >
                <AtomIcon name="Play" className="h-3.5 w-3.5" />
                {fullName(d.episode?.patient || {}) || "Patient"} · {d.episode?.title || ""} — Continue
              </Button>
            ))}
            {draftsQ.data.total > draftsQ.data.items.length ? (
              <Button variant="ghost" size="sm" className="text-amber-800" onClick={() => setStatusFilter("DRAFT")}>
                View all drafts
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mb-1.5">
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search patient, code, complaint…" }}
          filters={(
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-37.5"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
          )}
          onRefresh={() => listQ.refetch()}
          refreshing={listQ.isFetching}
        >
          {canManage ? (
            <Button onClick={() => onOpen({})}><AtomIcon name="Plus" className="h-4 w-4" />New assessment</Button>
          ) : null}
        </DataToolbar>
      </div>
      <DataTable
        rows={items}
        rowKey={(a) => a.id}
        loading={listQ.isLoading}
        minWidth="min-w-220"
        onRowClick={(a) => onOpen({ assessmentId: a.id })}
        empty={
          <EmptyState
          icon="ClipboardList"
          title={hasFilters ? "No assessments match your filters" : "No assessments yet"}
          description={hasFilters ? "Try adjusting the search or status filter." : "Start the first assessment for a patient episode."}
          action={canManage && !hasFilters ? <Button onClick={() => onOpen({})}>New assessment</Button> : hasFilters ? <Button variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</Button> : undefined}
          />
        }
        pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
        columns={[
          { id: "date", header: "Date", className: "whitespace-nowrap", cell: (a) => <span className="text-xs">{formatDate(a.assessmentDate)}</span> },
          {
            id: "patient", header: "Patient", className: "whitespace-nowrap",
            cell: (a) => (
              <>
                <p className="text-sm font-medium">{fullName(a.episode?.patient || {}) || "—"}</p>
                <p className="text-xs text-muted-foreground">{a.episode?.patient?.patientCode || ""}</p>
              </>
            ),
          },
          { id: "episode", header: "Episode", className: "max-w-45 truncate", cell: (a) => <span className="text-xs text-muted-foreground">{a.episode?.title || "—"}</span> },
          { id: "therapist", header: "Therapist", className: "whitespace-nowrap", cell: (a) => <span className="text-xs text-muted-foreground">{a.therapist ? fullName(a.therapist) : (a.therapistName || "—")}</span> },
          {
            id: "pain", header: "Pain (current / worst)", className: "whitespace-nowrap",
            cell: (a) =>
              a.painCurrent != null || a.painWorst != null ? (
                <span className="inline-flex items-center gap-1 text-xs">
                  <Badge variant="outline" className="bg-navy-50 text-navy-800 border-navy-200">{a.painCurrent ?? "—"}/10</Badge>
                  <span className="text-muted-foreground">/</span>
                  <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">{a.painWorst ?? "—"}/10</Badge>
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              ),
          },
          {
            id: "measures", header: "Measures", className: "whitespace-nowrap",
            cell: (a) => <span className="text-xs text-muted-foreground">{a._count ? `${a._count.romMeasurements || 0} ROM · ${a._count.strengthMeasurements || 0} str · ${a._count.functionalItems || 0} fn` : "—"}</span>,
          },
          { id: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
          {
            id: "actions", header: "", align: "right",
            cell: (a) => (
              <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); onOpen({ assessmentId: a.id }); }}>
                {a.status === "DRAFT" ? <><AtomIcon name="Play" className="h-3.5 w-3.5" />Continue</> : <><AtomIcon name="Eye" className="h-3.5 w-3.5" />Open</>}
              </Button>
            ),
          },
        ]}
      />
    </div>
  );
}
