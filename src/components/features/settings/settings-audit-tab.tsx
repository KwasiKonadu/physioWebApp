"use client";
// SETTINGS: Audit log tab — filters, expandable JSON detail rows, pagination
import { Fragment, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { labelize } from "@/lib/constants";
import { formatDateTime, relativeTime } from "@/lib/format";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { SectionCard } from "@/components/molecules/section-card";
import { TablePagination } from "@/components/molecules/table-pagination";
import { EmptyState } from "@/components/molecules/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AtomIcon } from "@/components/atoms/icon";
import { cn } from "@/lib/utils";

interface AuditRow {
  id: string;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: string;
  previousValues: unknown;
  newValues: unknown;
  reason: string | null;
  createdAt: string;
}

const ACTION_TONES: Record<string, string> = {
  CREATED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  UPDATED: "border-sky-200 bg-sky-50 text-sky-700",
  DEACTIVATED: "border-amber-200 bg-amber-50 text-amber-700",
  DELETED: "border-rose-200 bg-rose-50 text-rose-700",
  PASSWORD_RESET: "border-amber-200 bg-amber-50 text-amber-700",
};

function actionTone(action: string): string {
  for (const key of Object.keys(ACTION_TONES)) {
    if (action.includes(key)) return ACTION_TONES[key];
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function pretty(v: unknown): string {
  if (v === null || v === undefined) return "—";
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export default function SettingsAuditTab() {
  const [entityType, setEntityType] = useState("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (entityType !== "ALL") params.set("entityType", entityType);
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  if (search) params.set("search", search);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["audit-logs", entityType, from, to, search, page, pageSize],
    queryFn: () => apiFetch<{ items: AuditRow[]; total: number; page: number; pageSize: number; entityTypes: string[] }>(
      `/api/audit-logs?${params.toString()}`
    ),
  });

  const items = data?.items || [];

  return (
    <SectionCard
      title="Audit log"
      icon="History"
      description="Every staff, user, role and setting change — with before/after values"
      noPadding
    >
      <div className="p-4 pb-2">
        <DataToolbar
          search={{ value: searchInput, onChange: setSearchInput, placeholder: "Search user or action…" }}
          onRefresh={() => setPage(page)}
          refreshing={isFetching}
          filters={
            <>
              <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(1); }}>
                <SelectTrigger className="w-44"><SelectValue placeholder="Entity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All entities</SelectItem>
                  {(data?.entityTypes || []).map((t) => (
                    <SelectItem key={t} value={t}>{labelize(t)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-36" aria-label="From date" />
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-36" aria-label="To date" />
            </>
          }
        />
      </div>

      {isLoading ? (
        <div className="space-y-2 p-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-10 animate-pulse rounded bg-muted" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="p-4">
          <EmptyState icon="History" title="No audit entries" description="Changes made in the clinic will be recorded here." />
        </div>
      ) : (
        <>
          <div className="overflow-x-auto custom-scrollbar">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead className="hidden sm:table-cell">Entity</TableHead>
                  <TableHead className="hidden md:table-cell">Entity ID</TableHead>
                  <TableHead className="hidden lg:table-cell">Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <Fragment key={log.id}>
                    <TableRow
                      className={cn("cursor-pointer", expandedId === log.id && "bg-muted/40")}
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      <TableCell>
                        <AtomIcon
                          name={expandedId === log.id ? "ChevronDown" : "ChevronRight"}
                          className="h-4 w-4 text-muted-foreground"
                        />
                      </TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{relativeTime(log.createdAt)}</p>
                        <p className="hidden text-xs text-muted-foreground sm:block">{formatDateTime(log.createdAt)}</p>
                      </TableCell>
                      <TableCell className="text-sm">{log.userName || "System"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={actionTone(log.action)}>
                          {log.action.replaceAll("_", " ")}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-sm sm:table-cell">{labelize(log.entityType)}</TableCell>
                      <TableCell className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {log.entityId.slice(0, 10)}…
                      </TableCell>
                      <TableCell className="hidden max-w-52 truncate text-sm text-muted-foreground lg:table-cell">
                        {log.reason || "—"}
                      </TableCell>
                    </TableRow>
                    {expandedId === log.id && (
                      <TableRow key={`${log.id}-detail`} className="hover:bg-transparent">
                        <TableCell colSpan={7} className="bg-slate-50 p-4">
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Previous values</p>
                              <pre className="max-h-56 overflow-auto custom-scrollbar rounded-md border bg-white p-3 font-mono text-xs leading-relaxed text-navy-800">
                                {pretty(log.previousValues)}
                              </pre>
                            </div>
                            <div>
                              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New values</p>
                              <pre className="max-h-56 overflow-auto custom-scrollbar rounded-md border bg-white p-3 font-mono text-xs leading-relaxed text-teal-800">
                                {pretty(log.newValues)}
                              </pre>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </div>
          <TablePagination
            page={page}
            pageSize={pageSize}
            total={data?.total || 0}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </>
      )}
    </SectionCard>
  );
}
