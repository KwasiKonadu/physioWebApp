"use client";
// Staff profile: remuneration tab.

import { REMUNERATION_METHODS, labelize } from "@/lib/constants";
import { formatMoney } from "@/lib/format";
import { DetailGrid, DetailRow } from "@/components/molecules/detail-row";
import { SectionCard } from "@/components/molecules/section-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StaffDetail, StatsResponse, PERIODS, Period } from "./staff-profile-model";

export function StaffRemunerationTab({ s, stats, period, setPeriod, periodLabel, canManage, effMethod, method, rateGhs, savingRem, saveRemuneration, setMethod, setRateGhs }: { s: StaffDetail["staff"]; stats: StatsResponse | undefined; period: Period; setPeriod: (p: Period) => void; periodLabel: string; canManage: boolean; effMethod: string; method: string; rateGhs: string; savingRem: boolean; saveRemuneration: () => void; setMethod: (v: string) => void; setRateGhs: (v: string) => void }) {
  return (
    <TabsContent value="remuneration" className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <SectionCard title="Pay" icon="Wallet">
          {canManage ? (
            <div className="space-y-3">
              {s.isTherapist ? (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REMUNERATION_METHODS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m === "FIXED" ? "Fixed monthly salary" : m === "PER_PATIENT" ? "Per unique patient" : "Per completed session"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {effMethod === "FIXED" ? "Monthly salary (GHS)" : `Rate (GHS ${effMethod === "PER_SESSION" ? "per session" : "per unique patient"})`}
                </Label>
                <Input type="number" min="0" step="0.01" value={rateGhs} onChange={(e) => setRateGhs(e.target.value)} placeholder="0.00" />
              </div>
              <Button size="sm" onClick={() => void saveRemuneration()} disabled={savingRem}>
                {savingRem ? "Saving…" : "Save"}
              </Button>
            </div>
          ) : (
            <DetailGrid cols={1}>
              <DetailRow label="Method" value={s.remunerationMethod === "FIXED" ? "Fixed monthly salary" : labelize(s.remunerationMethod)} />
              <DetailRow label={s.remunerationMethod === "FIXED" ? "Monthly salary" : "Rate"} value={s.remunerationRateCents ? formatMoney(s.remunerationRateCents) : undefined} />
            </DetailGrid>
          )}
        </SectionCard>

        <SectionCard title="Computed remuneration" icon="Calculator" description={periodLabel}>
          <div className="mb-3 flex justify-end">
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {!stats ? (
            <Skeleton className="h-16 w-full" />
          ) : stats.remuneration.computedCents !== null ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 px-4 py-3">
              <span className="text-sm text-muted-foreground">
                {stats.remuneration.method === "FIXED"
                  ? `${formatMoney(stats.remuneration.rateCents ?? 0)} / month, pro-rated by days`
                  : `${stats.stats.completedSessions} sessions · ${stats.stats.uniquePatients} unique patients`}
              </span>
              <span className="text-xl font-semibold text-navy-800">{formatMoney(stats.remuneration.computedCents)}</span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No pay rate recorded yet{canManage ? " — set it on the left." : "."}</p>
          )}
        </SectionCard>
      </div>
    </TabsContent>
  );
}
