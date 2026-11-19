"use client";
// FEATURE: Treatment Plans module — plans list (filters, version expansion) → detail → wizard form
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { PERMS, PLAN_STATUSES } from "@/lib/constants";
import { formatDate, fullName, relativeTime } from "@/lib/format";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { plansApi } from "./plan-api";
import type { PlanListItemDto } from "./types";

// ---- inline version-history peek (shared "plans.detail" query cache) ----
function VersionPeek({ planId, onOpen }: { planId: string; onOpen: (id: string) => void }) {
  const q = useQuery({
    queryKey: ["plans", "detail", planId],
    queryFn: () => plansApi.detail(planId),
  });
  if (q.isLoading) return <Skeleton className="my-1 h-10 w-full" />;
  if (!q.data) return null;
  const versions = [...q.data.versions].sort((a, b) => b.version - a.version);
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-1 py-1">
      <span className="mr-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">Versions:</span>
      {versions.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onOpen(v.id)}
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
            v.id === planId ? "border-navy-300 bg-navy-50 text-navy-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          }`}
        >
          <span className="font-semibold">v{v.version}</span>
          <StatusBadge status={v.status} className="h-4 px-1.5 text-[10px]" />
        </button>
      ))}
    </div>
  );
}

function ScheduleSummary({ item }: { item: PlanListItemDto }) {
  return (
    <span className="text-sm text-muted-foreground">
      {item.sessionsPerWeek ? <><span className="font-medium text-foreground">{item.sessionsPerWeek}×</span>/wk</> : "—"}
      {item.expectedTotalSessions ? <> · {item.expectedTotalSessions} total</> : null}
      {item.sessionDurationMin ? <> · {item.sessionDurationMin}min</> : null}
    </span>
  );
}

function ReviewIndicator({ item }: { item: PlanListItemDto }) {
  const threshold = item.reviewThresholdSessions || item.episode.reviewThreshold || 15;
  const since = item.episode.sessionsSinceReview;
  if (item.episode.reviewDue) {
    return (
      <Badge className="bg-amber-500 text-[10px] text-white">
        review due ({since}/{threshold})
      </Badge>
    );
  }
  return (
    <span className={`text-xs ${since >= threshold * 0.8 ? "font-medium text-amber-600" : "text-muted-foreground"}`}>
      {since}/{threshold} sessions
    </span>
  );
}

function PlanRowMobile({ item, onOpen, onExpand, expanded, isOpen }: {
  item: PlanListItemDto;
  onOpen: () => void;
  onExpand: () => void;
  expanded: React.ReactNode;
  isOpen: boolean;
}) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <button type="button" className="w-full text-left" onClick={onOpen}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{fullName(item.episode.patient)}</p>
            <p className="truncate text-xs text-muted-foreground">{item.episode.patient.patientCode} · {item.episode.title}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Badge variant="outline" className="bg-navy-50 font-mono text-[10px] text-navy-800">v{item.version}</Badge>
            <StatusBadge status={item.status} className="text-[10px]" />
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <ScheduleSummary item={item} />
          <span>{formatDate(item.startDate)} → {formatDate(item.endDate)}</span>
          <span className="font-medium text-foreground">{item.objectivesAchieved}/{item.objectivesTotal} objectives</span>
          <ReviewIndicator item={item} />
          <span>updated {relativeTime(item.updatedAt)}</span>
        </div>
      </button>
      <div className="mt-2 flex items-center gap-2 border-t pt-2">
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-navy-800" onClick={onExpand}>
          <AtomIcon name={isOpen ? "ChevronUp" : "ChevronDown"} className="h-3.5 w-3.5" />
          Version history
        </button>
      </div>
      {isOpen ? expanded : null}
    </div>
  );
}

export default function TreatmentPlansPage() {
  const user = useAuthStore((s) => s.user);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const router = useRouter();
  const openNew = () => {
    const q = new URLSearchParams();
    if (preselect.patientId) q.set("patientId", preselect.patientId);
    if (preselect.episodeId) q.set("episodeId", preselect.episodeId);
    const qs = q.toString();
    router.push(qs ? `/treatment-plans/new?${qs}` : "/treatment-plans/new");
  };
  const [status, setStatus] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [scope, setScope] = useState<{ episodeId?: string; patientId?: string }>({});
  const [preselect, setPreselect] = useState<{ patientId?: string; episodeId?: string }>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // consume nav options (episodeId / patientId) once, then clear
  useEffect(() => {
    if (!navOpts) return;
    const opts = navOpts;
    const t = setTimeout(() => {
      setScope({ episodeId: opts.episodeId || undefined, patientId: opts.patientId || undefined });
      setPreselect({ patientId: opts.patientId || undefined, episodeId: opts.episodeId || undefined });
      setPage(1);
      clearOpts();
    }, 0);
    return () => clearTimeout(t);
  }, [navOpts, clearOpts]);

  const listQuery = useQuery({
    queryKey: ["plans", "list", { page, pageSize, status, search, ...scope }],
    queryFn: () => plansApi.list({
      page, pageSize,
      status: status === "all" ? undefined : status,
      search: search || undefined,
      episodeId: scope.episodeId,
      patientId: scope.patientId,
    }),
  });

  const statsQuery = useQuery({
    queryKey: ["plans", "stats"],
    queryFn: async () => {
      const [total, active, draft, review] = await Promise.all([
        plansApi.list({ page: 1, pageSize: 1 }),
        plansApi.list({ page: 1, pageSize: 1, status: "ACTIVE" }),
        plansApi.list({ page: 1, pageSize: 1, status: "DRAFT" }),
        plansApi.list({ page: 1, pageSize: 1, status: "UNDER_REVIEW" }),
      ]);
      return { total: total.total, active: active.total, draft: draft.total, review: review.total };
    },
  });

  const items = listQuery.data?.items || [];
  const scoped = !!(scope.episodeId || scope.patientId);
  const toggleExpand = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  // ================= LIST =================
  return (
    <div>
      <PageHeader
        title="Treatment Plans"
        description="Versioned rehabilitation plans with objectives, milestones and precautions"
        icon="Map"
      />

      {/* stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total plan versions" value={statsQuery.data?.total ?? "—"} icon="Map" tone="navy" loading={statsQuery.isLoading} onClick={() => setStatus("all")} />
        <StatCard label="Active plans" value={statsQuery.data?.active ?? "—"} icon="Zap" tone="teal" loading={statsQuery.isLoading} onClick={() => setStatus("ACTIVE")} />
        <StatCard label="Drafts" value={statsQuery.data?.draft ?? "—"} icon="FileEdit" tone="amber" loading={statsQuery.isLoading} onClick={() => setStatus("DRAFT")} />
        <StatCard label="Under review" value={statsQuery.data?.review ?? "—"} icon="SearchCheck" tone="sky" loading={statsQuery.isLoading} onClick={() => setStatus("UNDER_REVIEW")} />
      </div>

      <div className="mb-3">
        <DataToolbar
          search={{ value: searchInput, onChange: setSearchInput, placeholder: "Search patient name or code…" }}
          filters={
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger className="w-45"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {PLAN_STATUSES.map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          }
          onRefresh={() => listQuery.refetch()}
          refreshing={listQuery.isFetching}
        >
          {scoped ? (
            <Badge variant="outline" className="bg-sky-50 text-sky-700">
              {scope.episodeId ? "scoped to episode" : "scoped to patient"}
              <button
                type="button"
                className="ml-1 inline-flex text-sky-700 hover:text-sky-900"
                onClick={() => { setScope({}); setPreselect({}); setPage(1); }}
                aria-label="Clear scope filter"
              >
                <AtomIcon name="X" className="h-3 w-3" />
              </button>
            </Badge>
          ) : null}
          {canManage ? (
            <Button className="bg-navy-800 text-white hover:bg-navy-900" onClick={() => openNew()}>
          <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> New plan
        </Button>
          ) : null}
        </DataToolbar>
      </div>
      {/* desktop table */}
      <div className="hidden md:block">
        <DataTable
          rows={items}
          rowKey={(item) => item.id}
          loading={listQuery.isLoading}
          loadingRows={5}
          minWidth="min-w-240"
          onRowClick={(item) => router.push(`/treatment-plans/${item.id}`)}
          expandedRow={(item) => (expanded[item.id] ? <VersionPeek planId={item.id} onOpen={(id) => router.push(`/treatment-plans/${id}`)} /> : null)}
          empty={
            <EmptyState
              icon="Map"
              title="No treatment plans found"
              description={scoped || status !== "all" || search ? "Try adjusting the filters, or create a new plan." : "Create the first plan for an episode that has a completed assessment."}
              action={canManage ? (
                <Button onClick={() => openNew()}>
                  <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> New plan
                </Button>
              ) : undefined}
            />
          }
          pagination={listQuery.data && listQuery.data.total > 0 ? { page: listQuery.data.page, pageSize: listQuery.data.pageSize, total: listQuery.data.total, onPageChange: setPage, onPageSizeChange: setPageSize } : undefined}
          columns={[
            {
              id: "patient", header: "Patient",
              cell: (item) => (
                <>
                  <p className="font-medium text-foreground">{fullName(item.episode.patient)}</p>
                  <p className="font-mono text-xs text-muted-foreground">{item.episode.patient.patientCode}</p>
                </>
              ),
            },
            {
              id: "episode", header: "Episode", className: "max-w-55",
              cell: (item) => (
                <>
                  <p className="truncate text-sm" title={item.episode.title}>{item.episode.title}</p>
                  {item.episode.therapist ? <p className="truncate text-xs text-muted-foreground">{fullName(item.episode.therapist)}</p> : null}
                </>
              ),
            },
            { id: "ver", header: "Ver", className: "w-14", cell: (item) => <Badge variant="outline" className="bg-navy-50 font-mono text-xs text-navy-800">v{item.version}</Badge> },
            { id: "status", header: "Status", cell: (item) => <StatusBadge status={item.status} /> },
            { id: "schedule", header: "Schedule", cell: (item) => <ScheduleSummary item={item} /> },
            { id: "period", header: "Period", className: "whitespace-nowrap", cell: (item) => <span className="text-sm text-muted-foreground">{formatDate(item.startDate)} → {formatDate(item.endDate)}</span> },
            {
              id: "objectives", header: "Objectives",
              cell: (item) => (
                <span className="text-sm">
                  <span className="font-semibold text-navy-800">{item.objectivesAchieved}</span>
                  <span className="text-muted-foreground">/{item.objectivesTotal}</span>
                </span>
              ),
            },
            { id: "review", header: "Review", cell: (item) => <ReviewIndicator item={item} /> },
            { id: "updated", header: "Updated", className: "whitespace-nowrap", cell: (item) => <span className="text-xs text-muted-foreground">{relativeTime(item.updatedAt)}</span> },
            {
              id: "expand", header: "", className: "w-10",
              cell: (item) => (
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }} aria-label="Toggle version history">
                  <AtomIcon name={expanded[item.id] ? "ChevronUp" : "ChevronDown"} className="h-4 w-4" />
                </Button>
              ),
            },
          ]}
        />
      </div>

      <Card className="overflow-hidden py-0 shadow-sm md:hidden">
        {/* mobile cards */}
        <div className="space-y-3 p-3 md:hidden">
          {listQuery.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)
          ) : items.length === 0 ? (
            <EmptyState
              icon="Map"
              title="No treatment plans found"
              description="Adjust filters or create a new plan."
              action={canManage ? (
                <Button className="bg-navy-800 text-white hover:bg-navy-900" onClick={() => openNew()}>
                  <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> New plan
                </Button>
              ) : undefined}
            />
          ) : (
            items.map((item) => (
              <PlanRowMobile
                key={item.id}
                item={item}
                onOpen={() => router.push(`/treatment-plans/${item.id}`)}
                onExpand={() => toggleExpand(item.id)}
                isOpen={!!expanded[item.id]}
                expanded={<VersionPeek planId={item.id} onOpen={(id) => router.push(`/treatment-plans/${id}`)} />}
              />
            ))
          )}
        </div>

        {listQuery.data && listQuery.data.total > 0 ? (
          <TablePagination
            page={listQuery.data.page}
            pageSize={listQuery.data.pageSize}
            total={listQuery.data.total}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
          />
        ) : null}
      </Card>
    </div>
  );
}
