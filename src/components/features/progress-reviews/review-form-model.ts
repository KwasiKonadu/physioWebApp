// Progress review form: value types, defaults builder and objective result defaults.
import type { ComparisonRow, ReviewDetailResponse } from "./types";

export interface ObjectiveResultRow {
  objectiveId: string;
  objectiveDescription: string;
  baseline: string;
  target: string;
  current: string;
  result: string;
  notes: string;
}

export interface ReviewFormValues {
  painCurrent: number | null;
  painWorst: number | null;
  romSummary: string;
  strengthSummary: string;
  functionalSummary: string;
  vitals: string;
  newFindings: string;
  comparison: ComparisonRow[];
  improvements: string;
  deterioration: string;
  patientResponse: string;
  observations: string;
  recommendations: string;
  decision: string;
  decisionNotes: string;
  therapistSignature: string;
  objectiveResults: ObjectiveResultRow[];
}

export function defaultResultFor(objectiveStatus: string): string {
  if (objectiveStatus === "ACHIEVED") return "ACHIEVED";
  if (objectiveStatus === "NLA") return "NLA";
  if (objectiveStatus === "IN_PROGRESS") return "PARTIALLY_ACHIEVED";
  return "NOT_ACHIEVED";
}

export function buildDefaults(data: ReviewDetailResponse, signatureFallback: string): ReviewFormValues {
  const { review, baseline } = data;
  const savedResults = review.objectiveResults || [];
  const objectiveResults: ObjectiveResultRow[] = (baseline.plan?.objectives || []).map((o) => {
    const saved = savedResults.find((r) => r.objectiveId === o.id);
    return saved
      ? {
          objectiveId: saved.objectiveId,
          objectiveDescription: saved.objectiveDescription,
          baseline: saved.baseline || "",
          target: saved.target || "",
          current: saved.current || "",
          result: saved.result,
          notes: saved.notes || "",
        }
      : {
          objectiveId: o.id,
          objectiveDescription: o.description,
          baseline: o.baseline || "",
          target: o.target || "",
          current: "",
          result: defaultResultFor(o.status),
          notes: "",
        };
  });
  return {
    painCurrent: review.painCurrent,
    painWorst: review.painWorst,
    romSummary: review.romSummary || "",
    strengthSummary: review.strengthSummary || "",
    functionalSummary: review.functionalSummary || "",
    vitals: review.vitals || "",
    newFindings: review.newFindings || "",
    comparison: (review.comparison?.length ? review.comparison : baseline.comparison) as ComparisonRow[],
    improvements: review.improvements || "",
    deterioration: review.deterioration || "",
    patientResponse: review.patientResponse || "",
    observations: review.observations || "",
    recommendations: review.recommendations || "",
    decision: review.decision || "",
    decisionNotes: review.decisionNotes || "",
    therapistSignature: review.therapistSignature || signatureFallback,
    objectiveResults,
  };
}

// ---------- Read-only section A: previous clinical info ----------
