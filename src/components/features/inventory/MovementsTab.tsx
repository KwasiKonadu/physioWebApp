"use client";
// ============ Movements tab: full log of stock in / out / stocktake ============
import { useState } from "react";
import { DataTable, type DataColumn } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatCard } from "@/components/molecules/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateTime } from "@/lib/format";
import { useDebouncedValue } from "@/components/features/billing/billing-hooks";
import { useMovements, type MovementType, type StockMovement } from "./inventory-api";

const STYLE = { IN: "text-emerald-700", OUT: "text-rose-600", ADJUST: "text-slate-600" } as const;
const LABEL = { IN: "Stock in", OUT: "Stock out", ADJUST: "Stocktake" } as const;
const RANGES = [{ v: "all", label: "All time" }, { v: "1", label: "Today" }, { v: "7", label: "Last 7 days" }, { v: "30", label: "Last 30 days" }];

export default function MovementsTab() {
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | MovementType>("all");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const q = useMovements({ search: useDebouncedValue(search.trim(), 300), type, days: range, page, pageSize });
  const ready = !q.isLoading;
  const stats = q.data?.stats ?? { count: 0, unitsIn: 0, unitsOut: 0 };

  const reset = <T,>(set: (v: T) => void) => (v: T) => { set(v); setPage(1); };

  const columns: DataColumn<StockMovement>[] = [
    { id: "date", header: "Date", cell: (m) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(m.createdAt)}</span> },
    { id: "item", header: "Item", cell: (m) => <span className="text-sm font-medium">{m.itemName}</span> },
    { id: "type", header: "Type", cell: (m) => <span className="text-sm">{LABEL[m.type]}</span> },
    { id: "change", header: "Change", align: "right", cell: (m) => <span className={`text-sm font-semibold tabular-nums ${STYLE[m.type]}`}>{m.change > 0 ? "+" : ""}{m.change}</span> },
    { id: "after", header: "Balance", align: "right", cell: (m) => <span className="text-sm tabular-nums">{m.quantityAfter}</span> },
    { id: "reason", header: "Reason / reference", hideBelow: "md", cell: (m) => <span className="text-sm text-muted-foreground">{m.reason}</span> },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Movements" value={stats.count} icon="History" tone="navy" loading={!ready} hint="Matching the filters" />
        <StatCard label="Units received" value={stats.unitsIn} icon="ArrowDownToLine" tone="emerald" loading={!ready} />
        <StatCard label="Units issued" value={stats.unitsOut} icon="ArrowUpFromLine" tone="rose" loading={!ready} hint="Used, sold or written down" />
      </div>

      <DataToolbar
        search={{ value: search, onChange: reset(setSearch), placeholder: "Search item or reason…" }}
        filters={
          <>
            <Select value={type} onValueChange={(v) => reset(setType)(v as typeof type)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="IN">Stock in</SelectItem>
                <SelectItem value="OUT">Stock out</SelectItem>
                <SelectItem value="ADJUST">Stocktake</SelectItem>
              </SelectContent>
            </Select>
            <Select value={range} onValueChange={reset(setRange)}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.label}</SelectItem>)}</SelectContent>
            </Select>
          </>
        }
      />

      <DataTable
        rows={q.data?.items ?? []} columns={columns} rowKey={(m) => m.id} loading={q.isLoading}
        pagination={{ page, pageSize, total: q.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
        empty={<EmptyState icon="History" title="No stock movements" description="Adjust stock on the Inventory page or record a sale and it will be logged here." />}
      />
    </div>
  );
}
