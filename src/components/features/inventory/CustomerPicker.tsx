"use client";
// Searchable dropdown for a sale's customer. Looks like a Select: the search happens in the field itself
// (type to find a patient), and the list below holds "Walk-in customer" plus the matching patients.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AtomIcon } from "@/components/atoms/icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { patientName } from "@/components/features/billing/billing-format";
import { useDebouncedValue } from "@/components/features/billing/billing-hooks";
import type { PatientLite } from "@/components/features/billing/billing-types";
import { apiFetch } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const WALK_IN = "Walk-in customer";
const itemCls = "flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent";

/** null = walk-in customer */
export default function CustomerPicker({ value, onChange }: { value: PatientLite | null; onChange: (p: PatientLite | null) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<string | null>(null); // null = not typing, show the selected value
  const debounced = useDebouncedValue(query ?? "", 300);
  // an empty search lists the most recent patients, so the dropdown is useful before anything is typed
  const { data: results = [], isFetching, isError } = useQuery({
    queryKey: ["inventory", "customer-search", debounced.trim()],
    enabled: open,
    retry: false,
    staleTime: 30_000,
    queryFn: async () => {
      const q = debounced.trim();
      const data = await apiFetch<{ items?: PatientLite[] } | PatientLite[]>(`/api/patients?${q ? `search=${encodeURIComponent(q)}&` : ""}pageSize=${q ? 8 : 15}`);
      return Array.isArray(data) ? data : (data.items ?? []);
    },
  });

  const label = value ? `${patientName(value)} · ${value.patientCode}` : WALK_IN;
  const showWalkIn = !query || WALK_IN.toLowerCase().includes(query.trim().toLowerCase());

  const pick = (p: PatientLite | null) => { onChange(p); setQuery(null); setOpen(false); };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(null); }}>
      <PopoverAnchor asChild>
        <div className="relative">
          <Input
            role="combobox"
            aria-expanded={open}
            value={query ?? label}
            placeholder="Search patient by name, code or phone…"
            autoComplete="off"
            className="pr-8"
            onClick={(e) => { setOpen(true); e.currentTarget.select(); }}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
            onKeyDown={(e) => {
              if (e.key === "Escape") { setOpen(false); setQuery(null); }
              else if (e.key === "ArrowDown") setOpen(true);
            }}
          />
          <AtomIcon name="ChevronDown" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 opacity-50" />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="custom-scrollbar max-h-64 w-(--radix-popover-trigger-width) min-w-64 overflow-y-auto rounded-md p-1"
        // keep focus in the field so typing continues
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => { if ((e.target as HTMLElement).closest("[role=combobox]")) e.preventDefault(); }}
      >
        {showWalkIn ? (
          <button type="button" className={itemCls} onClick={() => pick(null)}>
            <AtomIcon name="UserRound" className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{WALK_IN}</span>
            {!value ? <AtomIcon name="Check" className="ml-auto h-4 w-4" /> : null}
          </button>
        ) : null}
        {results.map((p) => (
          <button key={p.id} type="button" className={itemCls} onClick={() => pick(p)}>
            <AtomIcon name="User" className="h-4 w-4 shrink-0 text-navy-800" />
            <span className="min-w-0">
              <span className="block truncate font-medium">{patientName(p)}</span>
              <span className="block text-xs text-muted-foreground">{p.patientCode}{p.phone ? ` · ${p.phone}` : ""}</span>
            </span>
            {value?.id === p.id ? <AtomIcon name="Check" className="ml-auto h-4 w-4 shrink-0" /> : null}
          </button>
        ))}
        {results.length === 0 ? (
          <p className={cn("px-2 py-2 text-xs text-muted-foreground", !showWalkIn && "py-3 text-center")}>{isFetching ? "Searching…" : isError ? "Couldn’t load patients — try again" : "No patients found"}</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
