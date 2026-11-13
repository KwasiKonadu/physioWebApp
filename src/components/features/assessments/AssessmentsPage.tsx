"use client";
// ============ AssessmentsPage: clinical assessments + diagnoses module (default export) ============
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/molecules/page-header";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { PERMS } from "@/lib/constants";
import { formatDate, fullName } from "@/lib/format";
import { useAuthStore, useUIStore, hasPermission } from "@/stores/app-store";
import * as API from "./assessments-api";
import AssessmentForm, { type AssessmentFormTarget } from "./AssessmentForm";
import DiagnosesTab from "./DiagnosesTab";

export default function AssessmentsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const navOpts = useUIStore((s) => s.navOpts);
  const clearOpts = useUIStore((s) => s.clearOpts);

  const [tab, setTab] = useState<"assessments" | "diagnoses">("assessments");
  const [mode, setMode] = useState<"list" | "form">("list");
  const [formTarget, setFormTarget] = useState<AssessmentFormTarget>({});

  // consume navigation options (e.g. patients page → open assessment for episode)
  useEffect(() => {
    if (!navOpts) return;
    /* eslint-disable react-hooks/set-state-in-effect -- spec pattern: consume navOpts in effect + clearOpts */
    if (navOpts.focusTab === "diagnoses") setTab("diagnoses");
    if (navOpts.episodeId) {
      setTab("assessments");
      setMode("form");
      setFormTarget({ patientId: navOpts.patientId, episodeId: navOpts.episodeId });
    }
    /* eslint-enable react-hooks/set-state-in-effect */
    clearOpts();
  }, [navOpts, clearOpts]);

  const openForm = (t: AssessmentFormTarget) => {
    setFormTarget(t);
    setMode("form");
  };
  const backToList = () => {
    setMode("list");
    setFormTarget({});
    qc.invalidateQueries({ queryKey: ["assessments"] });
  };
  const formDone = () => {
    setMode("list");
    setFormTarget({});
    qc.invalidateQueries({ queryKey: ["assessments"] });
    qc.invalidateQueries({ queryKey: ["patients"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  if (mode === "form") {
    return (
      <AssessmentForm
        target={formTarget}
        onTargetChange={setFormTarget}
        onDone={formDone}
        onBack={backToList}
      />
    );
  }

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as "assessments" | "diagnoses")} className="space-y-1">
      <PageHeader
        title="Assessments"
        description="Clinical assessments and diagnoses for every treatment episode"
        icon="ClipboardList"
        actions={
          tab === "assessments" && canManage ? (
            <Button onClick={() => openForm({})}><AtomIcon name="Plus" className="h-4 w-4" />New assessment</Button>
          ) : undefined
        }
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

      <SectionCard title="Assessment records" description="All initial and re-assessments across episodes" icon="ClipboardList" noPadding>
        <div className="border-b px-4 py-3">
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
          />
        </div>

        {listQ.isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
          </div>
        ) : total === 0 ? (
          <div className="p-4">
            <EmptyState
              icon="ClipboardList"
              title={hasFilters ? "No assessments match your filters" : "No assessments yet"}
              description={hasFilters ? "Try adjusting the search or status filter." : "Start the first assessment for a patient episode."}
              action={canManage && !hasFilters ? <Button onClick={() => onOpen({})}>New assessment</Button> : hasFilters ? <Button variant="outline" onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</Button> : undefined}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto custom-scrollbar">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Patient</TableHead>
                    <TableHead className="text-xs">Episode</TableHead>
                    <TableHead className="text-xs">Therapist</TableHead>
                    <TableHead className="text-xs">Pain (current / worst)</TableHead>
                    <TableHead className="text-xs">Measures</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((a) => (
                    <TableRow
                      key={a.id}
                      className="cursor-pointer"
                      onClick={() => onOpen({ assessmentId: a.id })}
                    >
                      <TableCell className="whitespace-nowrap text-xs">{formatDate(a.assessmentDate)}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p className="text-sm font-medium">{fullName(a.episode?.patient || {}) || "—"}</p>
                        <p className="text-xs text-muted-foreground">{a.episode?.patient?.patientCode || ""}</p>
                      </TableCell>
                      <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">{a.episode?.title || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">{a.therapist ? fullName(a.therapist) : (a.therapistName || "—")}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {a.painCurrent != null || a.painWorst != null ? (
                          <span className="inline-flex items-center gap-1">
                            <Badge variant="outline" className="bg-teal-50 text-teal-700 border-teal-200">{a.painCurrent ?? "—"}/10</Badge>
                            <span className="text-muted-foreground">/</span>
                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">{a.painWorst ?? "—"}/10</Badge>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {a._count ? `${a._count.romMeasurements || 0} ROM · ${a._count.strengthMeasurements || 0} str · ${a._count.functionalItems || 0} fn` : "—"}
                      </TableCell>
                      <TableCell><StatusBadge status={a.status} /></TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); onOpen({ assessmentId: a.id }); }}
                        >
                          {a.status === "DRAFT" ? (
                            <><AtomIcon name="Play" className="h-3.5 w-3.5" />Continue</>
                          ) : (
                            <><AtomIcon name="Eye" className="h-3.5 w-3.5" />Open</>
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={total}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </>
        )}
      </SectionCard>
      <p className="text-[11px] text-muted-foreground">
        Completed assessments are immutable — use “Start correction” on a completed record to create an audited new draft.
      </p>
    </div>
  );
}
