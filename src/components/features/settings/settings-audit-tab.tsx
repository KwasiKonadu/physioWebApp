"use client";
// SETTINGS: Audit log tab — filters, expandable JSON detail rows, pagination
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { labelize } from "@/lib/constants";
import { formatDateTime, relativeTime } from "@/lib/format";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AtomIcon } from "@/components/atoms/icon";

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

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audit-logs", entityType, from, to, search, page, pageSize],
    queryFn: () => apiFetch<{ items: AuditRow[]; total: number; page: number; pageSize: number; entityTypes: string[] }>(
      `/api/audit-logs?${params.toString()}`
    ),
  });

  const items = data?.items || [];

  return (
    <>
    <div className="mb-3">
      <DataToolbar
        search={{ value: searchInput, onChange: setSearchInput, placeholder: "Search user or action…" }}
        onRefresh={() => void refetch()}
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
    <DataTable
      rows={items}
      rowKey={(l: AuditRow) => l.id}
      loading={isLoading}
      minWidth="min-w-180"
      onRowClick={(l) => setExpandedId(expandedId === l.id ? null : l.id)}
      rowClassName={(l) => (expandedId === l.id ? "bg-muted/40" : undefined)}
      empty={<EmptyState icon="History" title="No audit entries" description="Changes made in the clinic will be recorded here." />}
      pagination={{ page, pageSize, total: data?.total || 0, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
      expandedRow={(log) =>
        expandedId === log.id ? (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <p className="label-caps mb-1.5">Previous values</p>
              <pre className="max-h-56 overflow-auto custom-scrollbar rounded-md border bg-white p-3 font-mono text-xs leading-relaxed text-navy-800">
                {pretty(log.previousValues)}
              </pre>
            </div>
            <div>
              <p className="label-caps mb-1.5">New values</p>
              <pre className="max-h-56 overflow-auto custom-scrollbar rounded-md border bg-white p-3 font-mono text-xs leading-relaxed text-navy-800">
                {pretty(log.newValues)}
              </pre>
            </div>
          </div>
        ) : null
      }
      columns={[
        { id: "chev", header: "", className: "w-8", cell: (l) => <AtomIcon name={expandedId === l.id ? "ChevronDown" : "ChevronRight"} className="h-4 w-4 text-muted-foreground" /> },
        {
          id: "time", header: "Time",
          cell: (l) => (
            <>
              <p className="text-sm font-medium">{relativeTime(l.createdAt)}</p>
              <p className="hidden text-xs text-muted-foreground sm:block">{formatDateTime(l.createdAt)}</p>
            </>
          ),
        },
        { id: "user", header: "User", cell: (l) => <span className="text-sm">{l.userName || "System"}</span> },
        { id: "action", header: "Action", cell: (l) => <Badge variant="outline" className={actionTone(l.action)}>{l.action.replaceAll("_", " ")}</Badge> },
        { id: "entity", header: "Entity", hideBelow: "sm", cell: (l) => <span className="text-sm">{labelize(l.entityType)}</span> },
        { id: "entityId", header: "Entity ID", hideBelow: "md", cell: (l) => <span className="font-mono text-xs text-muted-foreground">{l.entityId.slice(0, 10)}…</span> },
        { id: "reason", header: "Reason", hideBelow: "lg", className: "max-w-52 truncate", cell: (l) => <span className="text-sm text-muted-foreground">{l.reason || "—"}</span> },
      ]}
    />
    </>
  );
}
