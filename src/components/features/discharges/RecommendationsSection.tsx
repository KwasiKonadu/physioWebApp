"use client";
// Home exercise recommendations section.

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/molecules/section-card";
import { DetailRow, DetailGrid } from "@/components/molecules/detail-row";
import { AtomIcon } from "@/components/atoms/icon";
import type { UseFieldArrayReturn, UseFormReturn } from "react-hook-form";
import { DischargeFormValues, emptyRow } from "./discharge-form-model";


export function RecommendationsSection({ form, editable, isCompleted, recommendationsArray, watchedRecommendations }: { form: UseFormReturn<DischargeFormValues>; editable: boolean; isCompleted: boolean; recommendationsArray: UseFieldArrayReturn<DischargeFormValues, "recommendations">; watchedRecommendations: DischargeFormValues["recommendations"] }) {
  return (
    <>
    {/* Home exercise recommendations */}
    <section className="flex flex-1 flex-col">
      <SectionCard
        className="flex-1"
        title="Home programme"
        icon="Dumbbell"
        description="Exercises and advice for the patient to continue at home"
        actions={
          editable ? (
            <Button variant="outline" size="sm" onClick={() => recommendationsArray.append({ ...emptyRow })}>
              <AtomIcon name="Plus" className="mr-1.5 h-3.5 w-3.5" />
              Add exercise
            </Button>
          ) : undefined
        }
      >
        {recommendationsArray.fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No home exercise recommendations recorded.</p>
        ) : (
          <div className="space-y-3">
            {recommendationsArray.fields.map((f, idx) => {
              const row = watchedRecommendations?.[idx];
              return (
                <div key={f.id} className="rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold">{idx + 1}. {row?.exerciseName || <span className="text-muted-foreground">Unnamed exercise</span>}</p>
                    {editable ? (
                      <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => recommendationsArray.remove(idx)}>
                        <AtomIcon name="Trash2" className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {isCompleted ? (
                    <DetailGrid cols={3}>
                      <DetailRow label="Instructions" value={row?.instructions || "—"} />
                      <DetailRow label="Frequency" value={row?.frequency || "—"} />
                      <DetailRow label="Duration" value={row?.duration || "—"} />
                      <DetailRow label="Repetitions" value={row?.repetitions || "—"} />
                      <DetailRow label="Precautions" value={row?.precautions || "—"} />
                      <DetailRow label="Notes" value={row?.notes || "—"} />
                    </DetailGrid>
                  ) : (
                    <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 *:min-w-0">
                      <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                        <Label>Exercise name</Label>
                        <Input placeholder="e.g. Quad stick gait practice" {...form.register(`recommendations.${idx}.exerciseName` as const)} />
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Instructions</Label>
                        <Input placeholder="How to perform…" {...form.register(`recommendations.${idx}.instructions` as const)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Frequency</Label>
                        <Input placeholder="e.g. Daily" {...form.register(`recommendations.${idx}.frequency` as const)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Duration</Label>
                        <Input placeholder="e.g. 4 weeks" {...form.register(`recommendations.${idx}.duration` as const)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Repetitions</Label>
                        <Input placeholder="e.g. 3 × 10" {...form.register(`recommendations.${idx}.repetitions` as const)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Precautions</Label>
                        <Input placeholder="e.g. Stop if pain > 4/10" {...form.register(`recommendations.${idx}.precautions` as const)} />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Notes</Label>
                        <Input placeholder="Optional…" {...form.register(`recommendations.${idx}.notes` as const)} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </section>
    </>
  );
}
