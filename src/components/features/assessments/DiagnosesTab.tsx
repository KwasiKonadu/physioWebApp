"use client";
// ============ DiagnosesTab: clinical diagnoses list, detail + revision history ============
import { useState } from "react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AtomIcon } from "@/components/atoms/icon";
import { DIAGNOSIS_CATEGORIES, PERMS, labelize } from "@/lib/constants";
import { formatDate, fullName } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import * as API from "./assessments-api";
import { severityBadge } from "./DiagnosisShared";
import { AddDiagnosisDialog } from "./AddDiagnosisDialog";
import { DiagnosisDetailDialog } from "./DiagnosisDetailDialog";
import { ReviseDiagnosisDialog } from "./ReviseDiagnosisDialog";
import { useUrlState } from "@/hooks/use-url-state";

export default function DiagnosesTab() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);

  const [search, setSearch] = useUrlState("dx_q", "");
  const dq = API.useDebounced(search, 300);
  const [category, setCategory] = useUrlState("dx_cat", "all");
  const [status, setStatus] = useUrlState("dx_status", "all");
  const [page, setPage] = useUrlState("dx_page", 1);
  const [pageSize, setPageSize] = useUrlState("dx_size", 10);

  const [addOpen, setAddOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<API.DiagnosisListItem | null>(null);
  const [reviseItem, setReviseItem] = useState<API.DiagnosisListItem | null>(null);

  const listQ = useQuery({
    queryKey: ["diagnoses", "list", { dq, category, status, page, pageSize }],
    placeholderData: keepPreviousData,
    queryFn: () => API.fetchDiagnoses({
      search: dq || undefined,
      category: category === "all" ? undefined : category,
      status: status === "all" ? undefined : status,
      page,
      pageSize,
    }),
  });

  const items = listQ.data?.items || [];
  const total = listQ.data?.total || 0;

  const resetFilters = () => { setSearch(""); setCategory("all"); setStatus("all"); setPage(1); };

  return (
    <div className="space-y-4">
      <div className="mb-3">
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search diagnosis, patient, episode…" }}
          filters={(
            <>
              <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-45"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {DIAGNOSIS_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{labelize(c)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="SUPERSEDED">Superseded</SelectItem>
                </SelectContent>
              </Select>
            </>
          )}
          onRefresh={() => listQ.refetch()}
          refreshing={listQ.isFetching}
        >
          {canManage ? (
            <Button onClick={() => setAddOpen(true)}><AtomIcon name="Plus" className="h-4 w-4" />Add diagnosis</Button>
          ) : null}
        </DataToolbar>
      </div>
        <DataTable
          rows={items}
          rowKey={(dx) => dx.id}
          loading={listQ.isLoading}
          loadingRows={5}
          minWidth="min-w-240"
          onRowClick={(dx) => setDetailItem(dx)}
          empty={
            <EmptyState
            icon="FileText"
            title={dq || category !== "all" || status !== "all" ? "No diagnoses match your filters" : "No diagnoses recorded"}
            description={dq || category !== "all" || status !== "all" ? "Try adjusting the search or filters." : "Add a diagnosis from an episode to get started."}
            action={(dq || category !== "all" || status !== "all") ? <Button variant="outline" onClick={resetFilters}>Clear filters</Button> : undefined}
            />
          }
          pagination={{ page, pageSize, total, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
          columns={[
            { id: "date", header: "Date", className: "whitespace-nowrap", cell: (dx) => <span className="text-xs">{formatDate(dx.diagnosisDate)}</span> },
            {
              id: "patient", header: "Patient", className: "whitespace-nowrap",
              cell: (dx) => (
                <>
                  <p className="text-sm font-medium">{fullName(dx.episode?.patient || {}) || "—"}</p>
                  <p className="text-xs text-muted-foreground">{dx.episode?.patient?.patientCode || ""}</p>
                </>
              ),
            },
            { id: "episode", header: "Episode", className: "max-w-40 truncate", cell: (dx) => <span className="text-xs text-muted-foreground">{dx.episode?.title || "—"}</span> },
            { id: "diagnosis", header: "Diagnosis", className: "max-w-65", cell: (dx) => <p className="truncate text-sm font-medium">{dx.title}</p> },
            { id: "category", header: "Category", cell: (dx) => <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 text-xs">{labelize(dx.category)}</Badge> },
            { id: "body", header: "Body / side", className: "whitespace-nowrap", cell: (dx) => <span className="text-xs">{[dx.bodyPart, dx.affectedSide ? labelize(dx.affectedSide) : ""].filter(Boolean).join(" · ") || "—"}</span> },
            { id: "severity", header: "Severity", cell: (dx) => severityBadge(dx.severity) },
            {
              id: "prov", header: "Prov.",
              cell: (dx) =>
                dx.provisional ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="inline-flex text-sky-600"><AtomIcon name="Info" className="h-4 w-4" /></span>
                    </TooltipTrigger>
                    <TooltipContent>Provisional diagnosis — pending confirmation</TooltipContent>
                  </Tooltip>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                ),
            },
            { id: "therapist", header: "Therapist", className: "whitespace-nowrap", cell: (dx) => <span className="text-xs text-muted-foreground">{dx.therapistName || "—"}</span> },
            { id: "status", header: "Status", cell: (dx) => <StatusBadge status={dx.status} /> },
          ]}
        />

      <AddDiagnosisDialog open={addOpen} onOpenChange={setAddOpen} onSaved={() => qc.invalidateQueries({ queryKey: ["diagnoses"] })} />
      <DiagnosisDetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
        onRevise={() => { if (detailItem) { setReviseItem(detailItem); setDetailItem(null); } }}
        canManage={canManage}
      />
      <ReviseDiagnosisDialog
        item={reviseItem}
        onClose={() => setReviseItem(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["diagnoses"] })}
      />
    </div>
  );
}
