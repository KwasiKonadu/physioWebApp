"use client";
// Small presentational helpers of the assessment form: labelled field, detail row, pain slider, measurement table.
import { DataTable } from "@/components/molecules/data-table";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { DetailRow } from "@/components/molecules/detail-row";
import { AtomIcon } from "@/components/atoms/icon";
import { cn } from "@/lib/utils";

// ===================== small presentational helpers =====================
export { Field } from "@/components/molecules/field";

export function DRow({ label, value }: { label: string; value?: string | number | null }) {
  return <DetailRow label={label} value={value === null || value === undefined || value === "" ? "—" : String(value)} />;
}

export const PAIN_TONES = [
  "bg-emerald-500", "bg-emerald-500", "bg-lime-500", "bg-lime-500", "bg-yellow-500",
  "bg-amber-500", "bg-orange-500", "bg-orange-500", "bg-red-500", "bg-red-600", "bg-red-700",
];
export function PainSlider({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  return (
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="min-w-9 justify-center bg-navy-50 text-navy-800 border-navy-200">{value ?? "—"}/10</Badge>
          {value !== undefined ? (
            <button type="button" onClick={() => onChange(undefined)} className="text-muted-foreground hover:text-foreground" aria-label={`Clear ${label}`}>
              <AtomIcon name="X" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 grid grid-cols-11 gap-1" role="radiogroup" aria-label={label}>
        {PAIN_TONES.map((tone, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "h-8 rounded-md text-xs font-semibold transition-all",
              value === n ? cn(tone, "text-white shadow-sm ring-2 ring-offset-1 ring-slate-400") : "border bg-white text-slate-600 hover:bg-slate-100",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground"><span>0 — none</span><span>10 — worst</span></div>
    </div>
  );
}

export function MeasurementTable<T>({ rows, columns }: { rows: T[]; columns: [string, (r: T) => React.ReactNode][] }) {
  return (
    <DataTable
      bare
      compact
      maxHeight="max-h-none"
      minWidth="min-w-120"
      rows={rows}
      rowKey={(_r, i) => String(i)}
      columns={columns.map(([header, cell], i) => ({ id: String(i), header, cell }))}
    />
  );
}
