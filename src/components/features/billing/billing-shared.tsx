"use client";
// ============ Billing feature: shared types, hooks & small components ============
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { fromCents, toCents, fullName, formatDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { AtomIcon } from "@/components/atoms/icon";

// ---- Types (mirror the API payloads) ----
export interface ListResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PatientLite {
  id: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  patientCode: string;
  phone?: string | null;
  paymentArrangement?: string;
}

export interface ServiceLite {
  id: string;
  name: string;
  description?: string | null;
  category: string;
  standardPriceCents: number;
  defaultDurationMin: number;
  active: boolean;
  arrangements: string[];
}

export interface PackageDef {
  id: string;
  name: string;
  description?: string | null;
  sessions: number;
  priceCents: number;
  validityDays: number;
  serviceIds: string[];
  active: boolean;
  _count?: { patientPackages: number };
}

export interface PatientPackageItem {
  id: string;
  purchaseDate: string;
  expiryDate: string;
  totalSessions: number;
  usedSessions: number;
  amountPaidCents: number;
  status: string;
  remaining: number;
  patient: PatientLite;
  package: { id: string; name: string; sessions: number; priceCents: number; validityDays: number };
}

export interface ProviderLite {
  id: string;
  name: string;
  code: string;
  contactName?: string | null;
  contactPhone?: string | null;
  email?: string | null;
  billingArrangement: string;
  coveragePercent: number;
  active: boolean;
  _count?: { rates: number; claims: number };
}

export interface RateItem {
  id: string;
  providerId: string;
  serviceId: string;
  rateCents: number;
  coveragePercent: number;
  active: boolean;
  service: { id: string; name: string; standardPriceCents: number; category: string; active: boolean };
}

export interface ClaimItem {
  id: string;
  claimNumber: string;
  claimedCents: number;
  approvedCents: number;
  status: string;
  submittedDate?: string | null;
  decisionDate?: string | null;
  notes?: string | null;
  createdAt: string;
  provider: { id: string; name: string; code: string; billingArrangement: string };
  invoice: {
    id: string;
    invoiceNumber: string;
    totalCents: number;
    paidCents: number;
    status: string;
    insuranceCoveredCents?: number;
    patient: PatientLite;
  };
}

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  arrangement: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  insuranceCoveredCents: number;
  issuedAt: string;
  dueDate?: string | null;
  patient: PatientLite;
  episode?: { id: string; title: string; episodeNumber: number } | null;
  _count?: { items: number };
  claim?: { id: string; claimNumber: string; status: string } | null;
}

export interface InvoiceItemRow {
  id: string;
  serviceId?: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  appliedRateCents?: number | null;
  coveragePercent?: number | null;
  coveredCents: number;
}

export interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  arrangement: string;
  status: string;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  insuranceCoveredCents: number;
  notes?: string | null;
  issuedAt: string;
  dueDate?: string | null;
  patient: PatientLite & { email?: string | null };
  episode?: { id: string; title: string; episodeNumber: number; status: string } | null;
  items: InvoiceItemRow[];
  payments: { id: string; amountCents: number; method: string; reference?: string | null; notes?: string | null; paidAt: string }[];
  refunds: { id: string; amountCents: number; reason: string; refundedAt: string; paymentId?: string | null }[];
  claim?: ClaimItem | null;
}

export function patientName(p?: { firstName?: string | null; middleName?: string | null; lastName?: string | null; patientCode?: string | null } | null): string {
  if (!p) return "—";
  return fullName(p) || p.patientCode || "—";
}

// ---- Debounce hook ----
export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ---- Patient search (tolerant of the patients module's response shape) ----
export function usePatientSearch(query: string, enabled = true) {
  return useQuery({
    queryKey: ["billing", "patient-search", query],
    enabled: enabled && query.trim().length >= 1,
    queryFn: async () => {
      try {
        const data = await apiFetch<{ items?: PatientLite[] } | PatientLite[]>(`/api/patients?search=${encodeURIComponent(query.trim())}&pageSize=8`);
        const items = Array.isArray(data) ? data : (data.items ?? []);
        return items;
      } catch {
        try {
          const data = await apiFetch<{ items?: PatientLite[] } | PatientLite[]>(`/api/patients?q=${encodeURIComponent(query.trim())}&pageSize=8`);
          const items = Array.isArray(data) ? data : (data.items ?? []);
          return items;
        } catch {
          toast.error("Patient directory is unavailable right now");
          return [];
        }
      }
    },
    staleTime: 30_000,
  });
}

/** Searchable patient selector used across billing dialogs. */
export function PatientPicker({
  value,
  onChange,
  placeholder = "Search patient by name or code…",
  disabled,
}: {
  value: PatientLite | null;
  onChange: (p: PatientLite | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 300);
  const { data: results = [], isFetching } = usePatientSearch(debounced, open);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="h-10 w-full justify-between font-normal"
        >
          <span className="truncate">
            {value ? `${patientName(value)} · ${value.patientCode}` : <span className="text-muted-foreground">{placeholder}</span>}
          </span>
          <AtomIcon name="ChevronsUpDown" className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Name, code or phone…" value={query} onValueChange={setQuery} />
          <CommandList className="custom-scrollbar">
            <CommandEmpty>{isFetching ? "Searching…" : "No patients found"}</CommandEmpty>
            <CommandGroup>
              {results.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  onSelect={() => {
                    onChange(p);
                    setOpen(false);
                  }}
                >
                  <AtomIcon name="User" className="mr-2 h-4 w-4 text-teal-600" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{patientName(p)}</p>
                    <p className="text-xs text-muted-foreground">{p.patientCode}{p.phone ? ` · ${p.phone}` : ""}</p>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ---- GHS money input bound to integer cents ----
export function MoneyInput({
  cents,
  onCentsChange,
  id,
  placeholder = "0.00",
  disabled,
  className,
}: {
  cents: number;
  onCentsChange: (cents: number) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  // null = display derives from the authoritative `cents` prop (e.g. preset amounts)
  const [text, setText] = useState<string | null>(null);
  const displayed = text ?? (cents ? String(fromCents(cents)) : "");
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₵</span>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        disabled={disabled}
        className={`pl-7 ${className || ""}`}
        placeholder={placeholder}
        value={displayed}
        onChange={(e) => {
          const v = e.target.value;
          if (!/^\d*\.?\d*$/.test(v)) return;
          setText(v);
          const n = v === "" ? 0 : toCents(parseFloat(v));
          onCentsChange(Number.isFinite(n) ? n : 0);
        }}
        onBlur={() => setText(null)}
      />
    </div>
  );
}

// ---- Arrangement badge ----
export function ArrangementBadge({ arrangement }: { arrangement: string }) {
  const tone =
    arrangement === "INSURANCE" ? "bg-sky-50 text-sky-700 border-sky-200"
    : arrangement === "PACKAGE" ? "bg-teal-50 text-teal-700 border-teal-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={`font-medium ${tone}`}>{arrangement === "PAYG" ? "Pay as you go" : arrangement === "PACKAGE" ? "Package" : "Insurance"}</Badge>;
}

// ---- Money-in-GHS number helpers for forms ----
export function centsToInput(cents?: number | null): string {
  return cents ? String(fromCents(cents)) : "";
}
export function inputToCents(v: string): number {
  if (!v || v.trim() === "") return 0;
  const n = toCents(parseFloat(v));
  return Number.isFinite(n) ? n : 0;
}
export function dateInputValue(d?: string | Date | null): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
export function formatDateLabel(d?: string | Date | null): string {
  return formatDate(d);
}

/** Simple horizontal mini-bar for arrangement revenue splits. */
export function MiniBar({ label, cents, max, tone }: { label: string; cents: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.max(cents > 0 ? 6 : 0, Math.round((cents / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums">{cents === 0 ? "—" : `₵${(cents / 100).toFixed(2)}`}</span>
    </div>
  );
}

/** Typed response for GETs that also carry stats. */
export function usePagedQuery<T>(key: (string | number | Record<string, string> | undefined)[], path: string, enabled = true) {
  return useQuery<ListResponse<T> & { stats?: Record<string, unknown> }>({
    queryKey: key,
    enabled,
    queryFn: () => apiFetch(path),
  });
}

export function useStats<T extends { stats?: Record<string, unknown> }>(query: { data?: T }) {
  return useMemo(() => (query.data?.stats || {}) as Record<string, never>, [query.data]);
}
