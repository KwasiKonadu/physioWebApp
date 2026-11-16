"use client";
// Patient search-as-you-type selector used by the assessment and plan forms.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AtomIcon } from "@/components/atoms/icon";
import { fullName } from "@/lib/format";
import * as API from "./assessments-api";

// ===================== patient search select =====================
export function PatientSearchSelect({ selected, onSelect, onClear, autoFocus }: {
  selected?: API.PatientLite | null; onSelect: (p: API.PatientLite) => void; onClear?: () => void; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const dq = API.useDebounced(q, 300);
  const [open, setOpen] = useState(false);
  const searchQ = useQuery({
    queryKey: ["assessments", "patient-search", dq],
    queryFn: () => API.searchPatients(dq),
    enabled: open && dq.trim().length > 0,
  });

  if (selected) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <AtomIcon name="UserRound" className="h-4 w-4 text-teal-600" />
          <div>
            <p className="text-sm font-medium">{fullName(selected) || selected.id}</p>
            {selected.patientCode ? <p className="text-xs text-muted-foreground">{selected.patientCode}</p> : null}
          </div>
        </div>
        {onClear ? (
          <Button variant="ghost" size="sm" onClick={onClear} type="button">Change</Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="relative">
        <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search patients by name or code…"
          className="pl-8"
        />
      </div>
      {open && dq.trim() ? (
        <div className="absolute z-30 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow-md">
          {searchQ.isLoading ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
          ) : !searchQ.data?.length ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matching patients</p>
          ) : (
            <div className="max-h-56 overflow-y-auto custom-scrollbar">
              {searchQ.data.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/60"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onSelect(p); setOpen(false); setQ(""); }}
                >
                  <span className="text-sm font-medium">{fullName(p)}</span>
                  <span className="text-xs text-muted-foreground">{p.patientCode || ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
