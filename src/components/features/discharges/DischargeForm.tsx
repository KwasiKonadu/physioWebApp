"use client";
// FEATURE: full-page discharge form — final assessment, baseline comparison, objective outcomes,
// home exercise recommendations, follow-up, outstanding balance info, sign-off workflow
// (draft → pending sign-off → complete/closing the episode).

import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { apiFetch } from "@/lib/api-client";
import { fullName } from "@/lib/format";
import { PERMS } from "@/lib/constants";
import { useAuthStore, hasPermission, setNavGuard } from "@/stores/app-store";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/molecules/page-header";
import { EmptyState } from "@/components/molecules/empty-state";
import { changeFor } from "../progress-reviews/types";
import type { DischargeDetailResponse } from "../progress-reviews/types";
import { DischargeFormValues, buildDefaults } from "./discharge-form-model";
import { DischargeSummary } from "./DischargeSummary";
import { FinalAssessmentSection, BaselineComparisonSection, ObjectiveOutcomesSection, LimitationsSection, FollowUpSection } from "./DischargeSections";
import { RecommendationsSection } from "./RecommendationsSection";
import { SignOffSection } from "./SignOffSection";

export default function DischargeForm({ dischargeId, onBack }: { dischargeId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const detailQuery = useQuery({
    queryKey: ["discharge", dischargeId],
    queryFn: () => apiFetch<DischargeDetailResponse>(`/api/discharges/${dischargeId}`),
  });

  const form = useForm<DischargeFormValues>({
    defaultValues: {
      dischargeDate: "", reason: "", finalAssessment: "", baselineComparison: [], objectiveOutcomes: "",
      remainingLimitations: "", summary: "", followUpType: "", followUpDetails: "", recommendations: [],
      therapistSignature: user?.name || "",
    },
  });

  const data = detailQuery.data;
  useEffect(() => {
    if (data) form.reset(buildDefaults(data, user?.name || ""));
  }, [data]);

  const watchedComparison = useWatch({ control: form.control, name: "baselineComparison" });
  const watchedRecommendations = useWatch({ control: form.control, name: "recommendations" });
  const comparisonArray = useFieldArray({ control: form.control, name: "baselineComparison" });
  const recommendationsArray = useFieldArray({ control: form.control, name: "recommendations" });

  const { discharge, baseline } = data || {};
  const isCompleted = discharge?.status === "COMPLETED";

  const patch = useMutation({
    mutationFn: (opts: { values: DischargeFormValues; action?: "submit" | "back_to_draft" }) =>
      apiFetch<{ discharge: { id: string; status: string } }>(`/api/discharges/${dischargeId}`, {
        method: "PATCH",
        json: {
          ...(opts.action ? { action: opts.action } : {}),
          dischargeDate: opts.values.dischargeDate || undefined,
          reason: opts.values.reason || undefined,
          finalAssessment: opts.values.finalAssessment || null,
          baselineComparison: opts.values.baselineComparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          objectiveOutcomes: opts.values.objectiveOutcomes || null,
          remainingLimitations: opts.values.remainingLimitations || null,
          summary: opts.values.summary || null,
          followUpType: opts.values.followUpType || null,
          followUpDetails: opts.values.followUpDetails || null,
          recommendations: opts.values.recommendations
            .filter((r) => r.exerciseName.trim())
            .map((r) => ({
              exerciseName: r.exerciseName,
              instructions: r.instructions || null,
              frequency: r.frequency || null,
              duration: r.duration || null,
              repetitions: r.repetitions || null,
              precautions: r.precautions || null,
              notes: r.notes || null,
            })),
        },
      }),
    onSuccess: (res, opts) => {
      toast.success(opts.action === "submit" ? "Submitted for sign-off" : opts.action === "back_to_draft" ? "Moved back to draft" : "Draft saved");
      qc.invalidateQueries({ queryKey: ["discharge", dischargeId] });
      qc.invalidateQueries({ queryKey: ["discharges"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not save discharge"),
  });

  const complete = useMutation({
    mutationFn: (values: DischargeFormValues) =>
      apiFetch<{ discharge: { id: string; status: string }; episode: { id: string; status: string } }>(`/api/discharges/${dischargeId}/complete`, {
        method: "POST",
        json: {
          dischargeDate: values.dischargeDate || undefined,
          reason: values.reason || undefined,
          finalAssessment: values.finalAssessment || null,
          baselineComparison: values.baselineComparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          objectiveOutcomes: values.objectiveOutcomes || null,
          remainingLimitations: values.remainingLimitations || null,
          summary: values.summary || null,
          followUpType: values.followUpType || null,
          followUpDetails: values.followUpDetails || null,
          recommendations: values.recommendations
            .filter((r) => r.exerciseName.trim())
            .map((r) => ({
              exerciseName: r.exerciseName,
              instructions: r.instructions || null,
              frequency: r.frequency || null,
              duration: r.duration || null,
              repetitions: r.repetitions || null,
              precautions: r.precautions || null,
              notes: r.notes || null,
            })),
          therapistSignature: values.therapistSignature,
        },
      }),
    onSuccess: () => {
      toast.success("Discharge completed — treatment episode closed");
      qc.invalidateQueries({ queryKey: ["discharge", dischargeId] });
      qc.invalidateQueries({ queryKey: ["discharges"] });
      qc.invalidateQueries({ queryKey: ["picker-episodes"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not complete discharge"),
  });

  // ---- unsaved-changes protection (back button, breadcrumb, sidebar, tab close) ----
  const dirty = form.formState.isDirty && !isCompleted;
  const requestLeave = () => { if (dirty) setLeaveOpen(true); else onBack(); };
  const finishLeave = () => {
    setLeaveOpen(false);
    setNavGuard(null);
    const go = pendingLeave.current;
    pendingLeave.current = null;
    if (go) go(); else onBack();
  };
  useEffect(() => {
    if (!dirty) return;
    setNavGuard((proceed) => { pendingLeave.current = proceed; setLeaveOpen(true); return true; });
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => { setNavGuard(null); window.removeEventListener("beforeunload", h); };
  }, [dirty]);

  const handleComplete = () => {
    const values = form.getValues();
    if (!values.therapistSignature || values.therapistSignature.trim().length < 2) {
      toast.error("A therapist signature is required to complete the discharge");
      return;
    }
    complete.mutate(values);
  };

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !data || !discharge || !baseline) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Discharge record not found"
        description={detailQuery.error instanceof Error ? detailQuery.error.message : "This discharge record could not be loaded."}
        action={<Button variant="outline" onClick={onBack}>Back to discharges</Button>}
      />
    );
  }

  const outstanding = baseline.outstanding;
  const editable = !isCompleted && canManage;

  return (
    <div className="space-y-5">
      <PageBreadcrumb items={[{ label: "Discharges", onClick: requestLeave }, { label: `Discharge — ${fullName(discharge.patient)}` }]} />
      <PageHeader
        title="Discharge"
        description="Final assessment, outcomes, home programme and episode closure"
        icon="LogOut"
      />

      <DischargeSummary discharge={discharge} baseline={baseline} isCompleted={isCompleted} outstanding={outstanding} />

      <div className="grid gap-4 xl:grid-cols-[3fr_2fr] *:min-w-0">
        <div className="flex min-w-0 flex-col gap-4">
      <FinalAssessmentSection form={form} discharge={discharge} isCompleted={isCompleted} />

      <BaselineComparisonSection form={form} baseline={baseline} isCompleted={isCompleted} comparisonArray={comparisonArray} watchedComparison={watchedComparison} />

      <ObjectiveOutcomesSection form={form} baseline={baseline} discharge={discharge} isCompleted={isCompleted} />

      <RecommendationsSection form={form} editable={editable} isCompleted={isCompleted} recommendationsArray={recommendationsArray} watchedRecommendations={watchedRecommendations} />
        </div>
        <div className="flex min-w-0 flex-col gap-4">
      <LimitationsSection form={form} discharge={discharge} isCompleted={isCompleted} />
      <FollowUpSection form={form} discharge={discharge} isCompleted={isCompleted} />
      <SignOffSection outstanding={outstanding} form={form} discharge={discharge} editable={editable} isCompleted={isCompleted} patch={patch} complete={complete} confirmOpen={confirmOpen} setConfirmOpen={setConfirmOpen} handleComplete={handleComplete} />
        </div>
      </div>

      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this discharge?</DialogTitle>
            <DialogDescription>You have unsaved changes. Save a draft to keep them, or leave and discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard &amp; leave</Button>
            {discharge.status === "DRAFT" && editable ? (
              <Button disabled={patch.isPending} onClick={() => patch.mutate({ values: form.getValues() }, { onSuccess: finishLeave })}>
                {patch.isPending ? "Saving…" : "Save draft & leave"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
