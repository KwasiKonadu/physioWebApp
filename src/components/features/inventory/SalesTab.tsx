"use client";
// ============ Sales tab: sell inventory items, list past sales, void a sale ============
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
import { formatDateTime, formatMoney } from "@/lib/format";
import { PERMS } from "@/lib/constants";
import { useDebouncedValue } from "@/components/features/billing/billing-hooks";
import { hasPermission, useAuthStore } from "@/stores/app-store";
import NewSalePanel from "./NewSalePanel";
import { PAYMENT_METHODS, useSales, useVoidSale, type Sale } from "./inventory-api";

const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

export default function SalesTab() {
  const canManage = hasPermission(useAuthStore((s) => s.user), PERMS.inventoryManage);
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [newOpen, setNewOpen] = useState(false);
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const voidM = useVoidSale();

  const q = useSales({ search: useDebouncedValue(search.trim(), 300), method, page, pageSize });
  const ready = !q.isLoading;
  const stats = q.data?.stats ?? { todayCents: 0, todayCount: 0, totalCents: 0, transactions: 0, units: 0 };
  const sales = q.data?.items ?? [];
  const filtersOn = !!search.trim() || method !== "all";

  const columns: DataColumn<Sale>[] = [
    { id: "number", header: "Sale", cell: (s) => <span className="text-sm font-medium">{s.number}</span> },
    { id: "date", header: "Date", cell: (s) => <span className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(s.createdAt)}</span> },
    { id: "customer", header: "Customer", hideBelow: "md", cell: (s) => <span className="text-sm">{s.customer || "Walk-in"}</span> },
    { id: "items", header: "Items", hideBelow: "lg", cell: (s) => <span className="line-clamp-1 text-sm text-muted-foreground">{s.lines.map((l) => `${l.name} ×${l.quantity}`).join(", ")}</span> },
    { id: "method", header: "Payment", hideBelow: "sm", cell: (s) => <span className="text-sm">{methodLabel(s.paymentMethod)}</span> },
    { id: "total", header: "Total", align: "right", cell: (s) => <span className={`text-sm font-semibold tabular-nums ${s.voided ? "text-muted-foreground line-through" : ""}`}>{formatMoney(s.totalCents)}</span> },
    { id: "status", header: "Status", cell: (s) => s.voided ? <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[10px] text-slate-600">Voided</Badge> : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-[10px] text-emerald-700">Completed</Badge> },
    {
      id: "actions", header: "", align: "right", className: "w-1",
      cell: (s) => (
        <div onClick={(e) => e.stopPropagation()}>
          {!s.voided && canManage ? <Button variant="ghost" size="sm" className="h-7 text-xs text-rose-600" onClick={() => setVoiding(s)}>Void</Button> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sales today" value={formatMoney(stats.todayCents)} icon="ShoppingCart" tone="emerald" loading={!ready} hint={`${stats.todayCount} sale${stats.todayCount === 1 ? "" : "s"}`} />
        <StatCard label="Total sales" value={formatMoney(stats.totalCents)} icon="Wallet" tone="navy" loading={!ready} hint="Excluding voided" />
        <StatCard label="Units sold" value={stats.units} icon="Package" tone="sky" loading={!ready} />
        <StatCard label="Transactions" value={stats.transactions} icon="Receipt" tone="amber" loading={!ready} />
      </div>

      <DataToolbar
        search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Search sale, customer, item…" }}
        filters={
          <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1); }}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payment methods</SelectItem>
              {PAYMENT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      >
        {canManage ? <Button size="sm" onClick={() => setNewOpen(true)}><AtomIcon name="Plus" className="mr-1 h-4 w-4" />New sale</Button> : null}
      </DataToolbar>

      <DataTable
        rows={sales} columns={columns} rowKey={(s) => s.id} loading={q.isLoading}
        onRowClick={(s) => setExpanded((cur) => (cur === s.id ? null : s.id))}
        expandedRow={(s) => expanded === s.id ? (
          <div className="space-y-1 text-sm">
            {s.lines.map((l) => (
              <div key={l.id ?? l.name} className="flex justify-between gap-3">
                <span>{l.name} <span className="text-muted-foreground">× {l.quantity} {l.unit} @ {formatMoney(l.unitPriceCents)}</span></span>
                <span className="tabular-nums">{formatMoney(l.quantity * l.unitPriceCents)}</span>
              </div>
            ))}
            {s.note ? <p className="pt-1 text-xs text-muted-foreground">Note: {s.note}</p> : null}
          </div>
        ) : null}
        pagination={{ page, pageSize, total: q.data?.total ?? 0, onPageChange: setPage, onPageSizeChange: (n) => { setPageSize(n); setPage(1); } }}
        empty={q.isError
          ? <EmptyState icon="AlertCircle" title="Could not load sales" description="Please refresh or try again shortly." />
          : <EmptyState icon="ShoppingCart" title={filtersOn ? "No sales match your filters" : "No sales yet"} description={filtersOn ? "Try a different search or filter." : "Record your first sale to see it here."} action={filtersOn || !canManage ? undefined : <Button size="sm" onClick={() => setNewOpen(true)}>New sale</Button>} />}
      />

      <NewSalePanel open={newOpen} onClose={() => setNewOpen(false)} />

      <AlertDialog open={!!voiding} onOpenChange={(o) => { if (!o) setVoiding(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Void sale {voiding?.number}?</AlertDialogTitle>
            <AlertDialogDescription>The sale is marked voided and its items are returned to stock.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!voiding) return;
                voidM.mutate(voiding.id, { onSuccess: () => toast.success("Sale voided"), onError: (e: Error) => toast.error(e.message) });
                setVoiding(null);
              }}
            >Void sale</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
