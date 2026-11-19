"use client";
// FEATURE: full-page progress review form — baseline context (A), updated assessment (B),
// baseline comparison (C), objective evaluation (D), summary (E), decision (F), sign & complete (G).

import { PageBreadcrumb } from "@/components/molecules/page-breadcrumb";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { apiFetch } from "@/lib/api-client";
import { fullName, initials } from "@/lib/format";
import { labelize, PERMS } from "@/lib/constants";
import { useAuthStore, hasPermission, useUIStore, setNavGuard } from "@/stores/app-store";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/molecules/page-header";
import { StatusBadge } from "@/components/atoms/status-badge";
import { EmptyState } from "@/components/molecules/empty-state";
import { DECISION_TONE, changeFor } from "./types";
import type { ReviewDetailResponse } from "./types";
import type { ReviewFormValues } from "./review-form-model";
import { buildDefaults } from "./review-form-model";
import { BaselineSection } from "./ReviewBaselineSection";
import { DecisionSection, ComparisonSection, ObjectivesSection, SummarySection, UpdatedAssessmentSection, SignSection } from "./ReviewSections";

export default function ReviewForm({ reviewId, onBack }: { reviewId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const navigate = useUIStore((s) => s.navigate);
  const canManage = hasPermission(user, PERMS.clinicalManage);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const detailQuery = useQuery({
    queryKey: ["review", reviewId],
    queryFn: () => apiFetch<ReviewDetailResponse>(`/api/reviews/${reviewId}`),
  });

  const form = useForm<ReviewFormValues>({
    defaultValues: {
      painCurrent: null, painWorst: null, romSummary: "", strengthSummary: "", functionalSummary: "",
      vitals: "", newFindings: "", comparison: [], improvements: "", deterioration: "", patientResponse: "",
      observations: "", recommendations: "", decision: "", decisionNotes: "", therapistSignature: user?.name || "", objectiveResults: [],
    },
  });

  const data = detailQuery.data;
  useEffect(() => {
    if (data) form.reset(buildDefaults(data, user?.name || ""));
  }, [data]);

  const comparisonArray = useFieldArray({ control: form.control, name: "comparison" });
  const resultsArray = useFieldArray({ control: form.control, name: "objectiveResults" });

  const { review, baseline } = data || {};
  const isCompleted = review?.status === "COMPLETED";

  const saveDraft = useMutation({
    mutationFn: (values: ReviewFormValues) =>
      apiFetch(`/api/reviews/${reviewId}`, {
        method: "PATCH",
        json: {
          painCurrent: values.painCurrent,
          painWorst: values.painWorst,
          romSummary: values.romSummary || null,
          strengthSummary: values.strengthSummary || null,
          functionalSummary: values.functionalSummary || null,
          vitals: values.vitals || null,
          newFindings: values.newFindings || null,
          comparison: values.comparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          improvements: values.improvements || null,
          deterioration: values.deterioration || null,
          patientResponse: values.patientResponse || null,
          observations: values.observations || null,
          recommendations: values.recommendations || null,
          decision: values.decision || null,
          decisionNotes: values.decisionNotes || null,
          objectiveResults: values.objectiveResults.map((r) => ({
            objectiveId: r.objectiveId,
            objectiveDescription: r.objectiveDescription,
            baseline: r.baseline || null,
            target: r.target || null,
            current: r.current || null,
            result: r.result,
            notes: r.notes || null,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Draft saved");
      qc.invalidateQueries({ queryKey: ["review", reviewId] });
      qc.invalidateQueries({ queryKey: ["reviews"] });
    },
    onError: (err: Error) => toast.error(err.message || "Could not save draft"),
  });

  const complete = useMutation({
    mutationFn: (values: ReviewFormValues) =>
      apiFetch(`/api/reviews/${reviewId}/complete`, {
        method: "POST",
        json: {
          painCurrent: values.painCurrent,
          painWorst: values.painWorst,
          romSummary: values.romSummary || null,
          strengthSummary: values.strengthSummary || null,
          functionalSummary: values.functionalSummary || null,
          vitals: values.vitals || null,
          newFindings: values.newFindings || null,
          comparison: values.comparison.map((r) => {
            const change = changeFor(r);
            return { ...r, change: change.tone === "neutral" ? undefined : change.text };
          }),
          improvements: values.improvements || null,
          deterioration: values.deterioration || null,
          patientResponse: values.patientResponse || null,
          observations: values.observations || null,
          recommendations: values.recommendations || null,
          decision: values.decision,
          decisionNotes: values.decisionNotes || null,
          therapistSignature: values.therapistSignature,
          objectiveResults: values.objectiveResults.map((r) => ({
            objectiveId: r.objectiveId,
            objectiveDescription: r.objectiveDescription,
            baseline: r.baseline || null,
            target: r.target || null,
            current: r.current || null,
            result: r.result,
            notes: r.notes || null,
          })),
        },
      }),
    onSuccess: (_data, values) => {
      toast.success("Review completed — review counter reset");
      qc.invalidateQueries({ queryKey: ["reviews"] });
      qc.invalidateQueries({ queryKey: ["review", reviewId] });
      qc.invalidateQueries({ queryKey: ["picker-episodes"] });
      setNavGuard(null);
      const episodeId = review?.episodeId;
      if (values.decision === "REVISE_PLAN" && episodeId) {
        navigate("treatment-plans", { episodeId, focusTab: "revise" });
      } else if (values.decision === "DISCHARGE" && episodeId) {
        navigate("discharges", { episodeId });
      } else {
        onBack();
      }
    },
    onError: (err: Error) => toast.error(err.message || "Could not complete review"),
  });

  const decision = useWatch({ control: form.control, name: "decision" });
  const watchedComparison = useWatch({ control: form.control, name: "comparison" });
  const watchedResults = useWatch({ control: form.control, name: "objectiveResults" });

  const handleSubmitComplete = () => {
    const values = form.getValues();
    if (!values.decision) { toast.error("Select a review decision before completing"); return; }
    if (!values.therapistSignature || values.therapistSignature.trim().length < 2) { toast.error("Enter your signature before completing"); return; }
    complete.mutate(values);
  };

  // ---- unsaved-changes protection (back button, breadcrumb, sidebar, tab close) ----
  const dirty = form.formState.isDirty && data?.review?.status !== "COMPLETED";
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

  const sessionPct = useMemo(() => {
    if (!review) return 0;
    const threshold = review.episode.reviewThreshold || 15;
    return Math.min(100, Math.round((review.episode.sessionsSinceReview / threshold) * 100));
  }, [review]);

  if (detailQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-60 w-full" />
      </div>
    );
  }

  if (detailQuery.isError || !data || !review || !baseline) {
    return (
      <EmptyState
        icon="AlertTriangle"
        title="Review not found"
        description={detailQuery.error instanceof Error ? detailQuery.error.message : "This progress review could not be loaded."}
        action={<Button variant="outline" onClick={onBack}>Back to reviews</Button>}
      />
    );
  }

  const decisionBadge = review.decision ? (
    <Badge variant="outline" className={DECISION_TONE[review.decision]}>{labelize(review.decision)}</Badge>
  ) : null;

  return (
    <div className="space-y-5">
      <PageBreadcrumb items={[{ label: "Progress Reviews", onClick: requestLeave }, { label: `Review — ${fullName(review.episode.patient)}` }]} />
      <PageHeader
        title="Progress review"
        description="Re-assessment, objective evaluation and review decision"
        icon="TrendingUp"
      />

      {/* Summary card */}
      <div className="panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <Avatar className="h-12 w-12 rounded-xl">
              <AvatarFallback className="rounded-xl bg-navy-50 text-sm font-semibold text-navy-800">{initials(fullName(review.episode.patient))}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="min-w-0"><button type="button" title="Open patient profile" className="truncate text-left text-lg font-semibold tracking-tight transition-colors hover:text-navy-800 hover:underline focus-visible:outline-none focus-visible:underline" onClick={() => navigate("patients", { patientId: review.episode.patient.id })}>{fullName(review.episode.patient)}</button></h2>
                <span className="code-chip">{review.episode.patient.patientCode}</span>
                <StatusBadge status={review.status} />
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">{review.episode.title}</p>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4 lg:shrink-0">
            {[
              { l: "Trigger", v: `After ${review.triggerSessions} sessions` },
              { l: "Since last review", v: `${review.episode.sessionsSinceReview}/${review.episode.reviewThreshold}` },
              { l: "Therapist", v: review.episode.therapist ? fullName(review.episode.therapist) : "—" },
              { l: "Decision", v: review.decision ? labelize(review.decision) : "Pending" },
            ].map((x) => (
              <div key={x.l} className="min-w-0">
                <dt className="label-caps-sm">{x.l}</dt>
                <dd className="truncate text-sm font-semibold">{x.v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {!isCompleted && review.episode.reviewDue ? (
        <Alert className="border-amber-200 bg-amber-50 text-amber-800">
          <AlertTitle>Threshold review due</AlertTitle>
          <AlertDescription>
            This episode has reached {review.episode.sessionsSinceReview}/{review.episode.reviewThreshold} sessions since the last review. Completing this review resets the counter to 0.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="split-grid">
        <div className="flex min-w-0 flex-col gap-4">
      {/* A — Previous clinical info (read-only) */}
      <section className="space-y-2">
        <BaselineSection baseline={baseline} />
      </section>

      <DecisionSection form={form} review={review} isCompleted={isCompleted} decision={decision} decisionBadge={decisionBadge} />

      <ComparisonSection form={form} review={review} baseline={baseline} isCompleted={isCompleted} comparisonArray={comparisonArray} watchedComparison={watchedComparison} />

        </div>
        <div className="flex min-w-0 flex-col gap-4">
      <ObjectivesSection form={form} review={review} baseline={baseline} isCompleted={isCompleted} resultsArray={resultsArray} watchedResults={watchedResults} />

      <SummarySection form={form} review={review} isCompleted={isCompleted} />

      <UpdatedAssessmentSection form={form} review={review} baseline={baseline} isCompleted={isCompleted} />

      <SignSection form={form} review={review} isCompleted={isCompleted} sessionPct={sessionPct} />

        </div>
      </div>

      {!isCompleted && canManage ? (
        <div className="sticky bottom-0 z-10 rounded-lg border bg-background/95 p-3 backdrop-blur">
          <div className="toolbar-row">
            <p className="text-xs text-muted-foreground">Completing the review is final and resets the episode review counter.</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => saveDraft.mutate(form.getValues())} disabled={saveDraft.isPending}>
                {saveDraft.isPending ? "Saving…" : "Save draft"}
              </Button>
              <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={complete.isPending}>Sign &amp; complete</Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={leaveOpen} onOpenChange={(v) => { setLeaveOpen(v); if (!v) pendingLeave.current = null; }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Leave this review?</DialogTitle>
            <DialogDescription>You have unsaved changes. Save a draft to keep them, or leave and discard them.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setLeaveOpen(false)}>Keep editing</Button>
            <Button variant="outline" className="text-rose-600 hover:text-rose-700" onClick={finishLeave}>Discard &amp; leave</Button>
            {canManage ? (
              <Button disabled={saveDraft.isPending} onClick={() => saveDraft.mutate(form.getValues(), { onSuccess: finishLeave })}>
                {saveDraft.isPending ? "Saving…" : "Save draft & leave"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete this progress review?</AlertDialogTitle>
            <AlertDialogDescription>
              The review will be signed and locked as a clinical record, objective results will update the treatment plan, and the episode&apos;s review counter will reset to 0/{review?.episode.reviewThreshold ?? 15}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSubmitComplete} disabled={complete.isPending}>
              {complete.isPending ? "Completing…" : "Sign & complete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
