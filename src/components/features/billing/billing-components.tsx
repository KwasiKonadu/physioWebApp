"use client";
// Billing: patient picker, money input, arrangement badge and mini bar.
import { useState } from "react";
import { fromCents, toCents } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { AtomIcon } from "@/components/atoms/icon";
import type { PatientLite } from "./billing-types";
import { patientName } from "./billing-format";
import { useDebouncedValue, usePatientSearch } from "./billing-hooks";

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
      <PopoverContent className="w-90 p-0" align="start">
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
                  <AtomIcon name="User" className="mr-2 h-4 w-4 text-navy-800" />
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
    : arrangement === "PACKAGE" ? "bg-navy-50 text-navy-800 border-navy-200"
    : "bg-slate-100 text-slate-700 border-slate-200";
  return <Badge variant="outline" className={`font-medium ${tone}`}>{arrangement === "PAYG" ? "Pay as you go" : arrangement === "PACKAGE" ? "Package" : "Insurance"}</Badge>;
}

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
