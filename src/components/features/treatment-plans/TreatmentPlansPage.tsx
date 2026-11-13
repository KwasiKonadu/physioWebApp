"use client";
// FEATURE: Treatment Plans module — plans list (filters, version expansion) → detail → wizard form
import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { PERMS, PLAN_STATUSES } from "@/lib/constants";
import { formatDate, fullName, relativeTime } from "@/lib/format";
import { hasPermission, useAuthStore, useUIStore } from "@/stores/app-store";
import { plansApi } from "./plan-api";
import { PlanDetail } from "./PlanDetail";
import { PlanForm } from "./PlanForm";
import type { PlanListItemDto } from "./types";

type View =
  | { kind: "list" }
  | { kind: "detail"; planId: string }
  | { kind: "form"; mode: "create" | "edit" | "revise"; sourcePlanId?: string };

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
            v.id === planId ? "border-teal-300 bg-teal-50 text-teal-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
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
    <div className="rounded-xl border bg-white p-3 shadow-sm">
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
        <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-teal-700" onClick={onExpand}>
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

  const [view, setView] = useState<View>({ kind: "list" });
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

  // ================= DETAIL =================
  if (view.kind === "detail") {
    return (
      <div className="mx-auto max-w-6xl">
        <PlanDetail
          planId={view.planId}
          onBack={() => setView({ kind: "list" })}
          onEdit={() => setView({ kind: "form", mode: "edit", sourcePlanId: view.planId })}
          onRevise={() => setView({ kind: "form", mode: "revise", sourcePlanId: view.planId })}
          onOpenVersion={(id) => setView({ kind: "detail", planId: id })}
        />
      </div>
    );
  }

  // ================= FORM =================
  if (view.kind === "form") {
    const title = view.mode === "create" ? "New treatment plan" : view.mode === "edit" ? "Edit plan draft" : "Revise treatment plan";
    const subtitle = view.mode === "create"
      ? "Define objectives, milestones, interventions and precautions"
      : view.mode === "edit"
        ? "Draft plans can be edited freely until activated"
        : "Creates a new draft version — the currently active plan stays governing until you activate the revision";
    return (
      <div className="mx-auto max-w-5xl">
        <div className="mb-4 flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => setView({ kind: "list" })} aria-label="Back">
            <AtomIcon name="ArrowLeft" className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <PlanForm
          mode={view.mode}
          sourcePlanId={view.sourcePlanId || null}
          preselectPatientId={preselect.patientId}
          preselectEpisodeId={preselect.episodeId}
          onDone={(plan) => setView({ kind: "detail", planId: plan.id })}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  // ================= LIST =================
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        title="Treatment Plans"
        description="Versioned rehabilitation plans with objectives, milestones and precautions"
        icon="Map"
        actions={canManage ? (
          <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => setView({ kind: "form", mode: "create" })}>
            <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> New plan
          </Button>
        ) : undefined}
        filters={
          <DataToolbar
            search={{ value: searchInput, onChange: setSearchInput, placeholder: "Search patient name or code…" }}
            filters={
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
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
          </DataToolbar>
        }
      />

      {/* stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total plan versions" value={statsQuery.data?.total ?? "—"} icon="Map" tone="navy" loading={statsQuery.isLoading} onClick={() => setStatus("all")} />
        <StatCard label="Active plans" value={statsQuery.data?.active ?? "—"} icon="Zap" tone="teal" loading={statsQuery.isLoading} onClick={() => setStatus("ACTIVE")} />
        <StatCard label="Drafts" value={statsQuery.data?.draft ?? "—"} icon="FileEdit" tone="amber" loading={statsQuery.isLoading} onClick={() => setStatus("DRAFT")} />
        <StatCard label="Under review" value={statsQuery.data?.review ?? "—"} icon="SearchCheck" tone="sky" loading={statsQuery.isLoading} onClick={() => setStatus("UNDER_REVIEW")} />
      </div>

      <Card className="overflow-hidden py-0 shadow-sm">
        {/* desktop table */}
        <div className="hidden md:block">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Patient</TableHead>
                <TableHead>Episode</TableHead>
                <TableHead className="w-14">Ver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Schedule</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Objectives</TableHead>
                <TableHead>Review</TableHead>
                <TableHead>Updated</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {listQuery.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={10}><Skeleton className="h-10 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <div className="p-6">
                      <EmptyState
                        icon="Map"
                        title="No treatment plans found"
                        description={scoped || status !== "all" || search ? "Try adjusting the filters, or create a new plan." : "Create the first plan for an episode that has a completed assessment."}
                        action={canManage ? (
                          <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => setView({ kind: "form", mode: "create" })}>
                            <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> New plan
                          </Button>
                        ) : undefined}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => (
                  <Fragment key={item.id}>
                    <TableRow
                      className="cursor-pointer hover:bg-slate-50/80"
                      onClick={() => setView({ kind: "detail", planId: item.id })}
                    >
                      <TableCell>
                        <p className="font-medium text-foreground">{fullName(item.episode.patient)}</p>
                        <p className="font-mono text-xs text-muted-foreground">{item.episode.patient.patientCode}</p>
                      </TableCell>
                      <TableCell className="max-w-[220px]">
                        <p className="truncate text-sm" title={item.episode.title}>{item.episode.title}</p>
                        {item.episode.therapist ? (
                          <p className="truncate text-xs text-muted-foreground">{fullName(item.episode.therapist)}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-navy-50 font-mono text-xs text-navy-800">v{item.version}</Badge>
                      </TableCell>
                      <TableCell><StatusBadge status={item.status} /></TableCell>
                      <TableCell><ScheduleSummary item={item} /></TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(item.startDate)} → {formatDate(item.endDate)}
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          <span className="font-semibold text-teal-700">{item.objectivesAchieved}</span>
                          <span className="text-muted-foreground">/{item.objectivesTotal}</span>
                        </span>
                      </TableCell>
                      <TableCell><ReviewIndicator item={item} /></TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{relativeTime(item.updatedAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(item.id); }}
                          aria-label="Toggle version history"
                        >
                          <AtomIcon name={expanded[item.id] ? "ChevronUp" : "ChevronDown"} className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expanded[item.id] ? (
                      <TableRow key={`${item.id}-versions`}>
                        <TableCell colSpan={10} className="bg-slate-50/60">
                          <VersionPeek planId={item.id} onOpen={(id) => setView({ kind: "detail", planId: id })} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </div>

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
                <Button className="bg-teal-600 text-white hover:bg-teal-700" onClick={() => setView({ kind: "form", mode: "create" })}>
                  <AtomIcon name="Plus" className="mr-1.5 h-4 w-4" /> New plan
                </Button>
              ) : undefined}
            />
          ) : (
            items.map((item) => (
              <PlanRowMobile
                key={item.id}
                item={item}
                onOpen={() => setView({ kind: "detail", planId: item.id })}
                onExpand={() => toggleExpand(item.id)}
                isOpen={!!expanded[item.id]}
                expanded={<VersionPeek planId={item.id} onOpen={(id) => setView({ kind: "detail", planId: id })} />}
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
