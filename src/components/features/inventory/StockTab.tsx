"use client";
// ============ Stock tab: items, stock status, add / edit / adjust / delete ============
import { useState } from "react";
import { toast } from "sonner";
import { AtomIcon } from "@/components/atoms/icon";
import { DataTable, type DataColumn } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatCard } from "@/components/molecules/stat-card";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatMoney } from "@/lib/format";
import { PERMS } from "@/lib/constants";
import { useDebouncedValue } from "@/components/features/billing/billing-hooks";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import AdjustPanel from "./AdjustPanel";
import ItemPanel from "./ItemPanel";
import { INVENTORY_CATEGORIES, useDeleteItem, useStock, type InventoryItem, type StockStatus } from "./inventory-api";

const STATUS_STYLE: Record<StockStatus, { label: string; cls: string }> = {
  OK: { label: "In stock", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  LOW: { label: "Low stock", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  OUT: { label: "Out of stock", cls: "bg-rose-50 text-rose-700 border-rose-200" },
};

export default function StockTab() {
  const canManage = hasPermission(useAuthStore((s) => s.user), PERMS.inventoryManage);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState<"all" | StockStatus>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<InventoryItem | null>(null);
  const [deleting, setDeleting] = useState<InventoryItem | null>(null);
  const deleteM = useDeleteItem();

  const q = useStock({ search: useDebouncedValue(search.trim(), 300), category, status, page, pageSize });
  const ready = !q.isLoading;
  const stats = q.data?.stats ?? { total: 0, low: 0, out: 0, valueCents: 0 };
  const rows = q.data?.items ?? [];
  const filtersOn = !!search.trim() || category !== "all" || status !== "all";

  const pagination = { page, pageSize, total: q.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (s: number) => { setPageSize(s); setPage(1); } };

  const openNew = () => { setEditing(null); setFormOpen(true); };
  const openEdit = (i: InventoryItem) => { setEditing(i); setFormOpen(true); };

  const stockColumns: DataColumn<InventoryItem>[] = [
    {
      id: "name", header: "Item",
      cell: (i) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{i.name}</p>
          <p className="truncate text-xs text-muted-foreground">{[i.sku, i.location].filter(Boolean).join(" · ") || "—"}</p>
        </div>
      ),
    },
    { id: "category", header: "Category", hideBelow: "md", cell: (i) => <span className="text-sm">{i.category}</span> },
    { id: "qty", header: "In stock", align: "right", cell: (i) => <span className="text-sm font-semibold tabular-nums">{i.quantity} <span className="text-xs font-normal text-muted-foreground">{i.unit}</span></span> },
    { id: "reorder", header: "Reorder at", align: "right", hideBelow: "lg", cell: (i) => <span className="text-sm tabular-nums text-muted-foreground">{i.reorderLevel}</span> },
    { id: "cost", header: "Unit cost", align: "right", hideBelow: "lg", cell: (i) => <span className="text-sm tabular-nums">{formatMoney(i.unitCostCents)}</span> },
    { id: "value", header: "Value", align: "right", hideBelow: "xl", cell: (i) => <span className="text-sm tabular-nums">{formatMoney(i.quantity * i.unitCostCents)}</span> },
    {
      id: "status", header: "Status",
      cell: (i) => { const s = STATUS_STYLE[i.status]; return <Badge variant="outline" className={`text-[10px] ${s.cls}`}>{s.label}</Badge>; },
    },
    ...(!canManage ? [] : [{
      id: "actions", header: "", align: "right" as const, className: "w-1",
      cell: (i: InventoryItem) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setAdjusting(i)}>Adjust</Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Edit item" onClick={() => openEdit(i)}><AtomIcon name="Pencil" className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" aria-label="Delete item" onClick={() => setDeleting(i)}><AtomIcon name="Trash2" className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    }]),
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Items tracked" value={stats.total} icon="Package" tone="navy" loading={!ready} />
        <StatCard label="Low stock" value={stats.low} icon="AlertTriangle" tone="amber" hint="At or below reorder level" loading={!ready} onClick={() => { setStatus("LOW"); setPage(1); }} />
        <StatCard label="Out of stock" value={stats.out} icon="PackageX" tone="rose" loading={!ready} onClick={() => { setStatus("OUT"); setPage(1); }} />
        <StatCard label="Stock value" value={formatMoney(stats.valueCents)} icon="Wallet" tone="emerald" hint="At unit cost" loading={!ready} />
      </div>

      <DataToolbar
        search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search item, SKU, supplier…" }}
        filters={(
          <>
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {INVENTORY_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v as typeof status); setPage(1); }}>
              <SelectTrigger className="w-full sm:w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="OK">In stock</SelectItem>
                <SelectItem value="LOW">Low stock</SelectItem>
                <SelectItem value="OUT">Out of stock</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      >
        {canManage ? <Button size="sm" onClick={openNew}><AtomIcon name="Plus" className="mr-1 h-4 w-4" />New item</Button> : null}
      </DataToolbar>

      <DataTable
        rows={rows} columns={stockColumns} rowKey={(i) => i.id} loading={q.isLoading}
        onRowClick={canManage ? openEdit : undefined} pagination={pagination}
        empty={q.isError
          ? <EmptyState icon="AlertCircle" title="Could not load inventory" description="Please refresh or try again shortly." />
          : <EmptyState icon="Package" title={filtersOn ? "No items match your filters" : "No inventory yet"} description={filtersOn ? "Try a different search or filter." : "Add your first item to start tracking stock."} action={filtersOn || !canManage ? undefined : <Button size="sm" onClick={openNew}>New item</Button>} />}
      />

      <ItemPanel open={formOpen} item={editing} onClose={() => setFormOpen(false)} />
      <AdjustPanel item={adjusting} onClose={() => setAdjusting(null)} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => { if (!o) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>This removes the item and its movement history. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!deleting) return;
                deleteM.mutate(deleting.id, { onSuccess: () => toast.success("Item deleted"), onError: (e: Error) => toast.error(e.message) });
                setDeleting(null);
              }}
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
