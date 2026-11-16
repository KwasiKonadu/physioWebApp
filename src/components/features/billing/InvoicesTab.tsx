"use client";
// ============ Invoices tab: filters + list + new invoice builder + detail sheet ============
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { DataTable } from "@/components/molecules/data-table";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { StatusBadge } from "@/components/atoms/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate } from "@/lib/format";
import { useAuthStore, hasPermission, useUIStore } from "@/stores/app-store";
import { PERMS, INVOICE_STATUSES, PAYMENT_ARRANGEMENTS, labelize } from "@/lib/constants";
import { patientName, ArrangementBadge, type ListResponse, type InvoiceListItem } from "./billing-shared";
import InvoiceDetailSheet from "./InvoiceDetail";
import { NewInvoiceDialog } from "./NewInvoiceDialog";

interface InvoiceStatsPayload {
  stats: {
    outstandingCount: number;
    outstandingCents: number;
    paidThisMonthCents: number;
  };
}

export default function InvoicesTab({ prefillPatientId }: { prefillPatientId?: string | null }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.billingManage);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [arrangement, setArrangement] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  // open the detail sheet directly when navigated with invoiceId
  useEffect(() => {
    const t = setTimeout(() => {
      const opts = useUIStore.getState().navOpts;
      if (opts?.invoiceId) setDetailId(opts.invoiceId);
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const params = useMemo(() => {
    const p = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (search.trim()) p.set("search", search.trim());
    if (status !== "all") p.set("status", status);
    if (arrangement !== "all") p.set("arrangement", arrangement);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [page, pageSize, search, status, arrangement, from, to]);

  const listQ = useQuery({
    queryKey: ["billing", "invoices", params],
    queryFn: () => apiFetch<ListResponse<InvoiceListItem> & InvoiceStatsPayload>(`/api/invoices?${params}`),
  });

  const rows = listQ.data?.items || [];
  const outstanding = listQ.data?.stats;

  return (
    <div className="space-y-4">
      <div>
        <DataToolbar
          search={{ value: search, onChange: (v) => { setSearch(v); setPage(1); }, placeholder: "Invoice no. or patient…" }}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "invoices"] })}
          refreshing={listQ.isFetching}
          filters={
            <>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-32.5"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {INVOICE_STATUSES.map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={arrangement} onValueChange={(v) => { setArrangement(v); setPage(1); }}>
                <SelectTrigger className="w-35"><SelectValue placeholder="Arrangement" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All arrangements</SelectItem>
                  {PAYMENT_ARRANGEMENTS.map((a) => <SelectItem key={a} value={a}>{labelize(a)}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-1.5">
                <Input type="date" className="h-9 w-35" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} aria-label="Issued from" />
                <span className="text-xs text-muted-foreground">to</span>
                <Input type="date" className="h-9 w-35" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} aria-label="Issued to" />
              </div>
            </>
          }
        >
          {outstanding ? (
            <span className="mr-1 hidden rounded-md border bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 md:inline">
              Outstanding {formatMoney(outstanding.outstandingCents)} · {outstanding.outstandingCount} invoices
            </span>
          ) : null}
          {canManage ? (
            <Button onClick={() => setNewOpen(true)}>
              New invoice
            </Button>
          ) : null}
        </DataToolbar>
      </div>

      <DataTable
        rows={rows}
        rowKey={(inv) => inv.id}
        loading={listQ.isLoading}
        minWidth="min-w-220"
        onRowClick={(inv) => setDetailId(inv.id)}
        empty={
          <EmptyState
            icon="Receipt"
            title="No invoices found"
            description={search || status !== "all" || arrangement !== "all" || from || to ? "Try adjusting the filters." : "Issue your first invoice to get started."}
          />
        }
        pagination={{ page, pageSize, total: listQ.data?.total || 0, onPageChange: setPage, onPageSizeChange: (s) => { setPageSize(s); setPage(1); } }}
        columns={[
          {
            id: "invoice", header: "Invoice",
            cell: (inv) => (
              <span className="font-medium">
                {inv.invoiceNumber}
                {inv.claim ? <Badge variant="outline" className="ml-1.5 text-[10px]">{inv.claim.claimNumber}</Badge> : null}
              </span>
            ),
          },
          {
            id: "patient", header: "Patient",
            cell: (inv) => (
              <>
                <p className="text-sm font-medium">{patientName(inv.patient)}</p>
                <p className="text-xs text-muted-foreground">{inv.patient.patientCode}</p>
              </>
            ),
          },
          { id: "episode", header: "Episode", hideBelow: "md", className: "max-w-40 truncate", cell: (inv) => <span className="text-sm text-muted-foreground">{inv.episode ? inv.episode.title : "—"}</span> },
          { id: "arrangement", header: "Arrangement", cell: (inv) => <ArrangementBadge arrangement={inv.arrangement} /> },
          { id: "total", header: "Total", align: "right", cell: (inv) => <span className="tabular-nums">{formatMoney(inv.totalCents)}</span> },
          { id: "paid", header: "Paid", align: "right", cell: (inv) => <span className="tabular-nums text-emerald-700">{formatMoney(inv.paidCents)}</span> },
          { id: "balance", header: "Balance", align: "right", cell: (inv) => <span className="font-medium tabular-nums">{formatMoney(inv.totalCents - inv.paidCents)}</span> },
          { id: "status", header: "Status", cell: (inv) => <StatusBadge status={inv.status} /> },
          { id: "issued", header: "Issued", hideBelow: "lg", cell: (inv) => <span className="text-sm text-muted-foreground">{formatDate(inv.issuedAt)}</span> },
          { id: "actions", header: "Actions", align: "right", cell: (inv) => <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setDetailId(inv.id); }}>View</Button> },
        ]}
      />

      <NewInvoiceDialog open={newOpen} onClose={(created) => { setNewOpen(false); void created; }} prefillPatientId={prefillPatientId} />
      {detailId ? (
        <InvoiceDetailSheet
          invoiceId={detailId}
          open={!!detailId}
          onClose={() => { setDetailId(null); qc.invalidateQueries({ queryKey: ["billing", "invoices"] }); }}
        />
      ) : null}
    </div>
  );
}
