// Discharge form: value types, defaults builder and outcome summary.
import type { ComparisonRow, DischargeDetailResponse } from "../progress-reviews/types";

export interface RecommendationRow {
  exerciseName: string;
  instructions: string;
  frequency: string;
  duration: string;
  repetitions: string;
  precautions: string;
  notes: string;
}

export interface DischargeFormValues {
  dischargeDate: string;
  reason: string;
  finalAssessment: string;
  baselineComparison: ComparisonRow[];
  objectiveOutcomes: string;
  remainingLimitations: string;
  summary: string;
  followUpType: string;
  followUpDetails: string;
  recommendations: RecommendationRow[];
  therapistSignature: string;
}

export const emptyRow: RecommendationRow = { exerciseName: "", instructions: "", frequency: "", duration: "", repetitions: "", precautions: "", notes: "" };

export function buildDefaults(data: DischargeDetailResponse, signatureFallback: string): DischargeFormValues {
  const { discharge, baseline } = data;
  return {
    dischargeDate: discharge.dischargeDate ? discharge.dischargeDate.slice(0, 10) : "",
    reason: discharge.reason || "",
    finalAssessment: discharge.finalAssessment || "",
    baselineComparison: (discharge.baselineComparison?.length ? discharge.baselineComparison : baseline.comparison) as ComparisonRow[],
    objectiveOutcomes: discharge.objectiveOutcomes || "",
    remainingLimitations: discharge.remainingLimitations || "",
    summary: discharge.summary || "",
    followUpType: discharge.followUpType || "",
    followUpDetails: discharge.followUpDetails || "",
    recommendations: discharge.recommendations?.length
      ? discharge.recommendations.map((r) => ({
          exerciseName: r.exerciseName || "",
          instructions: r.instructions || "",
          frequency: r.frequency || "",
          duration: r.duration || "",
          repetitions: r.repetitions || "",
          precautions: r.precautions || "",
          notes: r.notes || "",
        }))
      : [],
    therapistSignature: discharge.therapistSignature || signatureFallback,
  };
}

export function objectiveSummary(baseline: DischargeDetailResponse["baseline"]): string {
  const objectives = baseline.plan?.objectives || [];
  if (objectives.length === 0) return "No plan objectives were defined for this episode.";
  const achieved = objectives.filter((o) => o.status === "ACHIEVED").length;
  const nla = objectives.filter((o) => o.status === "NLA").length;
  const notAchieved = objectives.filter((o) => o.status === "NOT_ACHIEVED").length;
  const rest = objectives.length - achieved - nla - notAchieved;
  return `${objectives.length} objective${objectives.length === 1 ? "" : "s"} on plan v${baseline.plan?.version}: ${achieved} achieved${notAchieved ? `, ${notAchieved} not achieved` : ""}${nla ? `, ${nla} no longer applicable` : ""}${rest ? `, ${rest} in progress/pending` : ""}.`;
}
