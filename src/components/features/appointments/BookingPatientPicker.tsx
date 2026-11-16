"use client";
// Patient search / selection block of the booking form.





import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


import { AtomIcon } from "@/components/atoms/icon";

import type { UseQueryResult } from "@tanstack/react-query";
import { PatientOption } from "./booking-shared";

export function BookingPatientPicker({ effectivePatient, selectedPatientId, query, onQueryChange, search, onPick, onClear, error }: {
  effectivePatient: PatientOption | null;
  selectedPatientId: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  search: UseQueryResult<PatientOption[]>;
  onPick: (p: PatientOption) => void;
  onClear: () => void;
  error?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>Patient</Label>
      {effectivePatient ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{effectivePatient.firstName} {effectivePatient.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {effectivePatient.patientCode}{effectivePatient.phone ? ` · ${effectivePatient.phone}` : ""}
            </p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>Change</Button>
        </div>
      ) : selectedPatientId ? (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
          <p className="truncate text-sm text-muted-foreground">Patient pre-selected (directory unavailable)</p>
          <Button type="button" variant="ghost" size="sm" onClick={onClear}>Change</Button>
        </div>
      ) : (
        <>
          <div className="relative">
            <AtomIcon name="Search" className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search by name, code or phone…"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              autoComplete="off"
            />
          </div>
          {query.trim().length > 0 ? (
            <div className="custom-scrollbar max-h-44 overflow-y-auto rounded-md border bg-white">
              {search.isFetching ? (
                <p className="px-3 py-2 text-xs text-muted-foreground">Searching…</p>
              ) : (search.data?.length || 0) > 0 ? (
                search.data!.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => onPick(p)}
                    className="flex w-full items-center justify-between gap-2 border-b border-border/60 px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{p.firstName} {p.lastName}</span>
                      <span className="block truncate text-xs text-muted-foreground">{p.patientCode}{p.phone ? ` · ${p.phone}` : ""}</span>
                    </span>
                    <AtomIcon name="ChevronRight" className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </button>
                ))
              ) : search.isError ? (
                <p className="px-3 py-2 text-xs text-amber-700">Patient directory unavailable — pick the patient from the Patients module.</p>
              ) : (
                <p className="px-3 py-2 text-xs text-muted-foreground">No patients matched “{query.trim()}”.</p>
              )}
            </div>
          ) : null}
        </>
      )}
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}
