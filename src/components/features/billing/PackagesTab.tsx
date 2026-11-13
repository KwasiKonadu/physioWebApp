"use client";
// ============ Packages tab: definitions catalogue + patient package sales & ledgers ============
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { DataToolbar } from "@/components/molecules/data-toolbar";
import { EmptyState } from "@/components/molecules/empty-state";
import { SectionCard } from "@/components/molecules/section-card";
import { StatCard } from "@/components/molecules/stat-card";
import { TablePagination } from "@/components/molecules/table-pagination";
import { StatusBadge } from "@/components/atoms/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api-client";
import { formatMoney, formatDate, fromCents } from "@/lib/format";
import { useAuthStore, hasPermission } from "@/stores/app-store";
import { PERMS, PAYMENT_METHODS, labelize } from "@/lib/constants";
import {
  PatientPicker, inputToCents, patientName, dateInputValue,
  type ListResponse, type PackageDef, type PatientPackageItem, type ServiceLite, type PatientLite,
} from "./billing-shared";

interface PackageTx {
  id: string;
  type: string;
  sessions: number;
  amountCents?: number | null;
  description?: string | null;
  createdAt: string;
}

// ---- Create / edit package definition ----
function PackageDefDialog({
  open,
  initial,
  onClose,
}: {
  open: boolean;
  initial: PackageDef | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(() => initial?.name || "");
  const [description, setDescription] = useState(() => initial?.description || "");
  const [sessions, setSessions] = useState(() => (initial ? String(initial.sessions) : "10"));
  const [priceText, setPriceText] = useState(() => (initial ? String(fromCents(initial.priceCents)) : ""));
  const [validityDays, setValidityDays] = useState(() => (initial ? String(initial.validityDays) : "90"));
  const [serviceIds, setServiceIds] = useState<string[]>(() => initial?.serviceIds || []);
  const [active, setActive] = useState(() => (initial ? initial.active : true));
  const [error, setError] = useState<string | null>(null);

  const servicesQ = useQuery({
    queryKey: ["billing", "services-active"],
    queryFn: () => apiFetch<ListResponse<ServiceLite>>("/api/services?active=true&pageSize=200"),
    enabled: true,
  });

  const saveM = useMutation({
    mutationFn: () => {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        sessions: parseInt(sessions, 10) || 0,
        priceCents: inputToCents(priceText),
        validityDays: parseInt(validityDays, 10) || 0,
        serviceIds,
        active,
      };
      if (initial) return apiFetch(`/api/packages/${initial.id}`, { method: "PATCH", json: payload });
      return apiFetch("/api/packages", { method: "POST", json: payload });
    },
    onSuccess: () => {
      toast.success(initial ? "Package updated" : "Package created");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit package" : "New package"}</DialogTitle>
          <DialogDescription>Predefined session bundles sold to patients at a package price.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Back Relief Pack" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Sessions *</Label>
            <Input type="number" min={1} value={sessions} onChange={(e) => setSessions(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Price (₵) *</Label>
            <Input type="number" min={0} step="0.01" value={priceText} onChange={(e) => setPriceText(e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Validity (days) *</Label>
            <Input type="number" min={1} value={validityDays} onChange={(e) => setValidityDays(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive packages cannot be sold</p>
            </div>
            <Switch checked={active} onCheckedChange={setActive} />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Included services</Label>
            <div className="grid max-h-40 grid-cols-1 gap-1.5 overflow-y-auto custom-scrollbar rounded-lg border p-2.5 sm:grid-cols-2">
              {(servicesQ.data?.items || []).map((s) => (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={serviceIds.includes(s.id)}
                    onCheckedChange={(v) => setServiceIds((prev) => (v ? [...prev, s.id] : prev.filter((x) => x !== s.id)))}
                  />
                  <span className="truncate">{s.name}</span>
                </label>
              ))}
              {servicesQ.isLoading && <Skeleton className="h-16 w-full" />}
            </div>
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => { setError(null); saveM.mutate(); }}
            disabled={saveM.isPending || !name.trim() || inputToCents(priceText) <= 0 || (parseInt(sessions, 10) || 0) < 1}
          >
            {saveM.isPending ? "Saving…" : initial ? "Save changes" : "Create package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Assign (sell) a package to a patient ----
function AssignPackageDialog({
  open,
  onClose,
  prefillPatientId,
}: {
  open: boolean;
  onClose: () => void;
  prefillPatientId?: string | null;
}) {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<PatientLite | null>(null);
  const [packageId, setPackageId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(() => dateInputValue(new Date()));
  const [amountText, setAmountText] = useState("");
  const [createInvoice, setCreateInvoice] = useState(true);
  const [method, setMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const defsQ = useQuery({
    queryKey: ["billing", "package-defs"],
    queryFn: () => apiFetch<ListResponse<PackageDef>>("/api/packages?active=true&pageSize=100"),
    enabled: open,
  });

  // prefill patient (cross-module navigation)
  useEffect(() => {
    if (!open || !prefillPatientId || patient) return;
    apiFetch<{ patient?: PatientLite } | PatientLite>(`/api/patients/${prefillPatientId}`)
      .then((data) => {
        const p = (data as { patient?: PatientLite }).patient || (data as PatientLite);
        if (p && p.id) setPatient(p);
      })
      .catch(() => undefined);
  }, [open, prefillPatientId, patient]);

  const selectedPkg = (defsQ.data?.items || []).find((p) => p.id === packageId) || null;

  const onPackageSelect = (id: string) => {
    setPackageId(id);
    const pkg = (defsQ.data?.items || []).find((p) => p.id === id) || null;
    if (pkg) setAmountText(String(fromCents(pkg.priceCents)));
  };

  const purchaseM = useMutation({
    mutationFn: () => {
      if (!patient) throw new Error("Select a patient");
      if (!selectedPkg) throw new Error("Select a package");
      return apiFetch("/api/patient-packages", {
        method: "POST",
        json: {
          patientId: patient.id,
          packageId: selectedPkg.id,
          purchaseDate: purchaseDate || undefined,
          amountPaidCents: amountText === "" ? selectedPkg.priceCents : inputToCents(amountText),
          createInvoice,
          method: createInvoice ? method : undefined,
          notes: notes.trim() || undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Package assigned to patient");
      qc.invalidateQueries({ queryKey: ["billing"] });
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign package to patient</DialogTitle>
          <DialogDescription>Creates the patient package, its PURCHASE ledger entry and optionally an invoice + payment.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Patient *</Label>
            <PatientPicker value={patient} onChange={setPatient} />
          </div>
          <div className="space-y-1.5">
            <Label>Package *</Label>
            <Select value={packageId} onValueChange={onPackageSelect}>
              <SelectTrigger><SelectValue placeholder="Select package…" /></SelectTrigger>
              <SelectContent className="custom-scrollbar max-h-64">
                {(defsQ.data?.items || []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.sessions} sessions · {formatMoney(p.priceCents)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPkg ? (
              <p className="text-xs text-muted-foreground">Valid {selectedPkg.validityDays} days from purchase.</p>
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Purchase date</Label>
              <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Amount paid (₵)</Label>
              <Input type="number" min={0} step="0.01" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder={selectedPkg ? String(fromCents(selectedPkg.priceCents)) : "0.00"} />
            </div>
          </div>
          <label className="flex items-center gap-2 rounded-lg border p-3 text-sm">
            <Checkbox checked={createInvoice} onCheckedChange={(v) => setCreateInvoice(!!v)} />
            <span>
              Create invoice for this purchase
              <span className="block text-xs text-muted-foreground">Records a payment against it when the amount paid is greater than zero.</span>
            </span>
          </label>
          {createInvoice && (
            <div className="space-y-1.5">
              <Label>Payment method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.filter((x) => x !== "INSURANCE").map((x) => <SelectItem key={x} value={x}>{labelize(x)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>
        {error && <p className="text-sm font-medium text-rose-600">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { setError(null); purchaseM.mutate(); }} disabled={purchaseM.isPending || !patient || !selectedPkg}>
            {purchaseM.isPending ? "Assigning…" : "Assign package"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Ledger + adjust + cancel ----
function LedgerDialog({
  patientPackageId,
  open,
  onClose,
}: {
  patientPackageId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [adjustType, setAdjustType] = useState("REVERSAL");
  const [adjustSessions, setAdjustSessions] = useState("1");
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustReason, setAdjustReason] = useState("");

  const detailQ = useQuery({
    queryKey: ["billing", "patient-package", patientPackageId],
    queryFn: () => apiFetch<{ patientPackage: PatientPackageItem & { transactions: PackageTx[]; invoice?: { id: string; invoiceNumber: string; status: string; totalCents: number; paidCents: number } | null } }>(`/api/patient-packages/${patientPackageId}`),
    enabled: open && !!patientPackageId,
  });
  const pp = detailQ.data?.patientPackage;

  const adjustM = useMutation({
    mutationFn: () =>
      apiFetch(`/api/patient-packages/${patientPackageId}/adjust`, {
        method: "POST",
        json: {
          type: adjustType,
          sessions: (adjustType === "REVERSAL" ? 1 : -1) * Math.abs(parseInt(adjustSessions, 10) || 0),
          description: adjustDescription.trim() || undefined,
          reason: adjustReason.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Adjustment recorded");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setAdjustOpen(false);
      setAdjustReason("");
      setAdjustDescription("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelM = useMutation({
    mutationFn: () => apiFetch(`/api/patient-packages/${patientPackageId}`, { method: "PATCH", json: { action: "cancel" } }),
    onSuccess: () => {
      toast.success("Package cancelled");
      qc.invalidateQueries({ queryKey: ["billing"] });
      setCancelOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto custom-scrollbar sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Package ledger — {pp ? pp.package.name : ""}</DialogTitle>
            <DialogDescription>{pp ? `${patientName(pp.patient)} · purchased ${formatDate(pp.purchaseDate)} · expires ${formatDate(pp.expiryDate)}` : ""}</DialogDescription>
          </DialogHeader>
          {detailQ.isLoading || !pp ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Used</p>
                  <p className="text-lg font-semibold">{pp.usedSessions}/{pp.totalSessions}</p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Remaining</p>
                  <p className="text-lg font-semibold text-teal-700">{pp.remaining}</p>
                </div>
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-lg font-semibold">{formatMoney(pp.amountPaidCents)}</p>
                </div>
              </div>

              {pp.invoice ? (
                <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3 py-2 text-sm">
                  <span>Linked invoice <span className="font-medium">{pp.invoice.invoiceNumber}</span></span>
                  <StatusBadge status={pp.invoice.status} />
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => setAdjustOpen(true)}>Adjust sessions</Button>
                {pp.status !== "CANCELLED" && (
                  <Button size="sm" variant="outline" className="border-rose-200 text-rose-700 hover:bg-rose-50" onClick={() => setCancelOpen(true)}>
                    Cancel package
                  </Button>
                )}
              </div>

              <div>
                <p className="mb-2 text-sm font-semibold">Transactions</p>
                {pp.transactions.length === 0 ? (
                  <EmptyStateCompact text="No transactions recorded." />
                ) : (
                  <ol className="relative space-y-3 border-l pl-4">
                    {pp.transactions.map((tx) => (
                      <li key={tx.id} className="relative">
                        <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-teal-500" />
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className={tx.type === "PURCHASE" ? "bg-teal-50 text-teal-700" : tx.type === "DEDUCTION" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}>
                            {labelize(tx.type)}
                          </Badge>
                          <span className={`text-sm font-semibold tabular-nums ${tx.sessions > 0 ? "text-emerald-700" : tx.sessions < 0 ? "text-rose-600" : ""}`}>
                            {tx.sessions > 0 ? `+${tx.sessions}` : tx.sessions} sessions
                          </span>
                          <span className="text-xs text-muted-foreground">{formatDate(tx.createdAt)}</span>
                        </div>
                        {tx.description ? <p className="mt-0.5 text-xs text-muted-foreground">{tx.description}</p> : null}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adjust package sessions</DialogTitle>
            <DialogDescription>
              REVERSAL returns sessions to the patient; ADJUSTMENT consumes sessions manually. An admin reason is required and audited.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select value={adjustType} onValueChange={setAdjustType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="REVERSAL">Reversal (return sessions)</SelectItem>
                  <SelectItem value="ADJUSTMENT">Adjustment (consume sessions)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sessions</Label>
              <Input type="number" min={1} value={adjustSessions} onChange={(e) => setAdjustSessions(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Input value={adjustDescription} onChange={(e) => setAdjustDescription(e.target.value)} placeholder="e.g. session missed by therapist" />
            </div>
            <div className="space-y-1.5">
              <Label>Reason *</Label>
              <Input value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} placeholder="Why is this adjustment needed?" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button onClick={() => adjustM.mutate()} disabled={adjustM.isPending || (parseInt(adjustSessions, 10) || 0) < 1 || adjustReason.trim().length < 3}>
              {adjustM.isPending ? "Saving…" : "Record adjustment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this patient package?</AlertDialogTitle>
            <AlertDialogDescription>
              Remaining sessions become unusable and a CANCELLED entry is written to the ledger. This action is audited.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep package</AlertDialogCancel>
            <AlertDialogAction className="bg-rose-600 hover:bg-rose-700" disabled={cancelM.isPending} onClick={(e) => { e.preventDefault(); cancelM.mutate(); }}>
              Cancel package
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function EmptyStateCompact({ text }: { text: string }) {
  return <p className="px-4 py-5 text-center text-sm text-muted-foreground">{text}</p>;
}

export default function PackagesTab({ prefillPatientId }: { prefillPatientId?: string | null }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.packagesManage);

  const [defDialogOpen, setDefDialogOpen] = useState(false);
  const [editingDef, setEditingDef] = useState<PackageDef | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [ledgerId, setLedgerId] = useState<string | null>(null);
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const defsQ = useQuery({
    queryKey: ["billing", "package-defs", "all"],
    queryFn: () => apiFetch<ListResponse<PackageDef>>("/api/packages?pageSize=100"),
  });

  const ppParams = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status !== "all") ppParams.set("status", status);
  const ppQ = useQuery({
    queryKey: ["billing", "patient-packages", ppParams.toString()],
    queryFn: () => apiFetch<ListResponse<PatientPackageItem> & { stats: { active: number; exhausted: number; expiringSoon: number } }>(`/api/patient-packages?${ppParams.toString()}`),
  });

  const toggleActiveM = useMutation({
    mutationFn: (p: PackageDef) => apiFetch(`/api/packages/${p.id}`, { method: "PATCH", json: { active: !p.active } }),
    onSuccess: () => {
      toast.success("Package updated");
      qc.invalidateQueries({ queryKey: ["billing"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const defs = defsQ.data?.items || [];
  const rows = ppQ.data?.items || [];
  const stats = ppQ.data?.stats;

  return (
    <div className="space-y-5">
      {stats ? (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Active packages" value={stats.active} icon="Layers" tone="teal" loading={ppQ.isLoading} />
          <StatCard label="Exhausted" value={stats.exhausted} icon="CheckCircle2" tone="amber" loading={ppQ.isLoading} />
          <StatCard label="Expiring ≤ 14 days" value={stats.expiringSoon} icon="CalendarClock" tone="rose" loading={ppQ.isLoading} />
        </div>
      ) : null}

      <SectionCard
        title="Package definitions"
        icon="Package"
        description="Session bundles offered for sale"
        loading={defsQ.isLoading}
        actions={
          canManage ? (
            <Button size="sm" onClick={() => { setEditingDef(null); setDefDialogOpen(true); }}>
              New package
            </Button>
          ) : null
        }
      >
        {defs.length === 0 ? (
          <EmptyState icon="Package" title="No package definitions" description="Create a package to start selling session bundles." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {defs.map((d) => (
              <div key={d.id} className="rounded-lg border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{d.description || "—"}</p>
                  </div>
                  <Badge variant="outline" className={d.active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : ""}>{d.active ? "Active" : "Inactive"}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-sm font-semibold">{d.sessions}</p><p className="text-[11px] text-muted-foreground">sessions</p></div>
                  <div><p className="text-sm font-semibold">{formatMoney(d.priceCents)}</p><p className="text-[11px] text-muted-foreground">price</p></div>
                  <div><p className="text-sm font-semibold">{d.validityDays}d</p><p className="text-[11px] text-muted-foreground">validity</p></div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                  <span className="text-xs text-muted-foreground">Sold {d._count?.patientPackages ?? 0}×</span>
                  {canManage ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={d.active}
                        onCheckedChange={() => toggleActiveM.mutate(d)}
                        aria-label={`Toggle ${d.name}`}
                      />
                      <Button size="sm" variant="outline" onClick={() => { setEditingDef(d); setDefDialogOpen(true); }}>Edit</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <div className="rounded-lg border bg-white shadow-sm">
        <div className="border-b p-4">
          <DataToolbar
            onRefresh={() => qc.invalidateQueries({ queryKey: ["billing", "patient-packages"] })}
            refreshing={ppQ.isFetching}
            filters={
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {["ACTIVE", "EXHAUSTED", "EXPIRED", "CANCELLED"].map((s) => <SelectItem key={s} value={s}>{labelize(s)}</SelectItem>)}
                </SelectContent>
              </Select>
            }
          >
            {canManage ? <Button size="sm" onClick={() => setAssignOpen(true)}>Assign package</Button> : null}
          </DataToolbar>
        </div>

        {ppQ.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : rows.length === 0 ? (
          <div className="p-6">
            <EmptyState icon="Layers" title="No patient packages" description="Assign a package to a patient to see it here." />
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Package</TableHead>
                  <TableHead className="hidden md:table-cell">Purchased</TableHead>
                  <TableHead className="hidden md:table-cell">Expiry</TableHead>
                  <TableHead className="min-w-[140px]">Usage</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((pp) => (
                  <TableRow key={pp.id}>
                    <TableCell>
                      <p className="text-sm font-medium">{patientName(pp.patient)}</p>
                      <p className="text-xs text-muted-foreground">{pp.patient.patientCode}</p>
                    </TableCell>
                    <TableCell className="text-sm">{pp.package.name}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatDate(pp.purchaseDate)}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{formatDate(pp.expiryDate)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress value={pp.totalSessions ? (pp.usedSessions / pp.totalSessions) * 100 : 0} className="h-2 w-16" />
                        <span className="text-xs tabular-nums text-muted-foreground">{pp.usedSessions}/{pp.totalSessions}</span>
                      </div>
                      <p className="mt-0.5 text-[11px] text-teal-700">{pp.remaining} remaining</p>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatMoney(pp.amountPaidCents)}</TableCell>
                    <TableCell><StatusBadge status={pp.status} /></TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => setLedgerId(pp.id)}>Ledger</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination
              page={page}
              pageSize={pageSize}
              total={ppQ.data?.total || 0}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </>
        )}
      </div>

      {defDialogOpen && <PackageDefDialog open initial={editingDef} onClose={() => setDefDialogOpen(false)} />}
      {assignOpen && <AssignPackageDialog open onClose={() => setAssignOpen(false)} prefillPatientId={prefillPatientId} />}
      <LedgerDialog patientPackageId={ledgerId} open={!!ledgerId} onClose={() => { setLedgerId(null); qc.invalidateQueries({ queryKey: ["billing", "patient-packages"] }); }} />
    </div>
  );
}
