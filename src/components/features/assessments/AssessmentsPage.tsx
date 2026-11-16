"use client";
// ============ AssessmentsPage: clinical assessments + diagnoses module (default export) ============
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/molecules/page-header";
import { StatCard } from "@/components/molecules/stat-card";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { PERMS } from "@/lib/constants";
import { formatDate, fullName } from "@/lib/format";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import * as API from "./assessments-api";
import type { AssessmentFormTarget } from "./AssessmentForm";
import DiagnosesTab from "./DiagnosesTab";

export default function AssessmentsPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);

  const [tab, setTab] = useState<"assessments" | "diagnoses">("assessments");

  // consume navigation options (e.g. patients page → start an assessment for an episode)
  useEffect(() => {
    if (!navOpts) return;
    // one-shot navigation hint from another page: switch tab, then clear it
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (navOpts.focusTab === "diagnoses") setTab("diagnoses");
    if (navOpts.episodeId) {
      const q = new URLSearchParams();
      if (navOpts.patientId) q.set("patientId", navOpts.patientId);
      q.set("episodeId", navOpts.episodeId);
      router.push(`/assessments/new?${q.toString()}`);
    }
    clearOpts();
  }, [navOpts, clearOpts, router]);

  // open an existing assessment, or start a new one (own URLs: /assessments/[id], /assessments/new)
  const openForm = (target: AssessmentFormTarget) => {
    if (target.assessmentId) {
      router.push(`/assessments/${target.assessmentId}`);
      return;
    }
    const q = new URLSearchParams();
    if (target.patientId) q.set("patientId", target.patientId);
    if (target.episodeId) q.set("episodeId", target.episodeId);
    const qs = q.toString();
    router.push(qs ? `/assessments/new?${qs}` : "/assessments/new");
  };

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "assessments" | "diagnoses")} className="space-y-1">
      <PageHeader
        title="Assessments"
        description="Clinical assessments and diagnoses for every treatment episode"
        icon="ClipboardList"
        filters={
          <TabsList>
            <TabsTrigger value="assessments"><AtomIcon name="ClipboardList" className="h-4 w-4" />Assessments</TabsTrigger>
            <TabsTrigger value="diagnoses"><AtomIcon name="FileText" className="h-4 w-4" />Diagnoses</TabsTrigger>
          </TabsList>
        }
      />
      <TabsContent value="assessments" className="mt-2">
        <AssessmentsList canManage={canManage} onOpen={openForm} />
      </TabsContent>
      <TabsContent value="diagnoses" className="mt-2">
        <DiagnosesTab />
      </TabsContent>
    </Tabs>
  );
}

// ===================== assessments list =====================
function AssessmentsList({ canManage, onOpen }: {
  canManage: boolean;
  onOpen: (t: AssessmentFormTarget) => void;
}) {
  const [search, setSearch] = useState("");
  const dq = API.useDebounced(search, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const listQ = useQuery({
    queryKey: ["assessments", "list", { dq, statusFilter, page, pageSize }],
    queryFn: () => API.fetchAssessments({
      search: dq || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      page,
      pageSize,
    }),
  });

  const statsQ = useQuery({
    queryKey: ["assessments", "stats"],
    queryFn: async () => {
      const [all, drafts, completed] = await Promise.all([
        API.fetchAssessments({ pageSize: 1 }),
        API.fetchAssessments({ status: "DRAFT", pageSize: 1 }),
        API.fetchAssessments({ status: "COMPLETED", pageSize: 1 }),
      ]);
      return { total: all.total, drafts: drafts.total, completed: completed.total };
    },
    refetchInterval: 60_000,
  });

  const draftsQ = useQuery({
    queryKey: ["assessments", "drafts"],
    queryFn: () => API.fetchAssessments({ status: "DRAFT", page: 1, pageSize: 4 }),
  });

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

      <div className="mb-3">
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search patient, code, complaint…" }}
          filters={(
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="h-9 w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
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
                  <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{a.painCurrent ?? "—"}/10</Badge>
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
              <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); onOpen({ assessmentId: a.id }); }}>
                {a.status === "DRAFT" ? <><AtomIcon name="Play" className="h-3.5 w-3.5" />Continue</> : <><AtomIcon name="Eye" className="h-3.5 w-3.5" />Open</>}
              </Button>
            ),
          },
        ]}
      />
      <p className="text-[11px] text-muted-foreground">
        Completed assessments are immutable — use “Start correction” on a completed record to create an audited new draft.
      </p>
    </div>
  );
}
