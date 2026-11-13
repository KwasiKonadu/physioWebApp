// ============ Shared types for Progress Reviews + Discharges (client) ============

export interface ComparisonRow {
  metric: string;
  baseline: string;
  current: string;
  change?: string;
  direction?: "higher" | "lower";
}

export interface PickerEpisode {
  id: string;
  title: string;
  status: string;
  openedDate?: string;
  totalCompletedSessions: number;
  sessionsSinceReview: number;
  reviewThreshold: number;
  reviewDue?: boolean;
  patient: { id: string; patientCode: string; firstName: string; lastName: string };
  therapist: { firstName: string; lastName: string } | null;
}

export interface DueEpisode extends PickerEpisode {
  lastReviewDate: string | null;
  draftReviewId: string | null;
}

export interface ReviewListItem {
  id: string;
  episodeId: string;
  triggerSessions: number;
  reviewDate: string;
  status: string;
  decision: string | null;
  episode: {
    id: string;
    title: string;
    status: string;
    patient: { patientCode: string; firstName: string; lastName: string };
    therapist: { firstName: string; lastName: string } | null;
  };
  plan: { version: number; status: string } | null;
}

export interface ReviewsListResponse {
  items: ReviewListItem[];
  total: number;
  page: number;
  pageSize: number;
  dueEpisodes: DueEpisode[];
  stats: { due: number; draft: number; completed: number };
}

export interface PlanObjectiveDto {
  id: string;
  description: string;
  baseline: string | null;
  target: string | null;
  unit: string | null;
  priority: string | null;
  status: string;
  expectedDate: string | null;
}

export interface MilestoneDto {
  id: string;
  description: string;
  expectedDate: string | null;
  status: string;
  notes: string | null;
}

export interface AssessmentBaseline {
  id: string;
  assessmentDate: string;
  primaryComplaint: string | null;
  bodyPart: string | null;
  affectedSide: string | null;
  duration: string | null;
  onset: string | null;
  cause: string | null;
  aggravating: string | null;
  relieving: string | null;
  pain: { current: number | null; worst: number | null; lowest: number | null; location: string | null; type: string | null; frequency: string | null; notes: string | null };
  observation: { posture: string | null; swelling: string | null; deformity: string | null; skinCondition: string | null; muscleWasting: string | null; gait: string | null };
  vitals: { bloodPressure: string | null; heartRate: number | null; respiratoryRate: number | null; temperature: number | null; oxygenSaturation: number | null; weightKg: number | null; heightCm: number | null };
  clinicalFindings: string | null;
  impairments: string | null;
  functionalLimitations: string | null;
  clinicalImpression: string | null;
  precautions: string | null;
  additionalNotes: string | null;
  therapistSignature: string | null;
  rom: { bodyPart: string; movement: string; side: string; active: number | null; passive: number | null; normal: number | null; notes: string | null }[];
  strength: { bodyPart: string; muscleGroup: string; side: string; grade: number; notes: string | null }[];
  functional: { activity: string; difficulty: number; label: string; notes: string | null }[];
}

export interface ClinicalBaseline {
  episode: { id: string; title: string; status: string; openedDate: string; totalCompletedSessions: number; sessionsSinceReview: number; reviewThreshold: number; reviewDue: boolean };
  patient: { id: string; patientCode: string; firstName: string; middleName: string | null; lastName: string; phone: string; paymentArrangement: string; currentStatus: string };
  therapist: { id: string; firstName: string; lastName: string; jobTitle: string } | null;
  assessment: AssessmentBaseline | null;
  diagnoses: { id: string; title: string; category: string; bodyPart: string | null; affectedSide: string | null; severity: string | null; explanation: string | null; diagnosisDate: string }[];
  plan: {
    id: string;
    version: number;
    status: string;
    sessionsPerWeek: number | null;
    expectedTotalSessions: number | null;
    sessionDurationMin: number | null;
    startDate: string | null;
    endDate: string | null;
    objectives: PlanObjectiveDto[];
    milestones: MilestoneDto[];
    interventions: { id: string; name: string; description: string | null; frequency: string | null; duration: string | null; instructions: string | null }[];
  } | null;
  previousReviews: { id: string; reviewDate: string; decision: string | null; status: string; triggerSessions: number; painCurrent: number | null; comparison: ComparisonRow[] }[];
  comparison: ComparisonRow[];
  outstanding: { invoiceCount: number; outstandingCents: number; invoices: { invoiceNumber: string; status: string; totalCents: number; paidCents: number }[] };
}

export interface ObjectiveResultDto {
  objectiveId: string;
  objectiveDescription: string;
  baseline: string | null;
  target: string | null;
  current: string | null;
  result: string;
  notes: string | null;
}

export interface ReviewDetail {
  id: string;
  episodeId: string;
  planId: string | null;
  triggerSessions: number;
  reviewDate: string;
  status: string;
  painCurrent: number | null;
  painWorst: number | null;
  romSummary: string | null;
  strengthSummary: string | null;
  functionalSummary: string | null;
  vitals: string | null;
  newFindings: string | null;
  comparison: ComparisonRow[];
  improvements: string | null;
  deterioration: string | null;
  patientResponse: string | null;
  observations: string | null;
  recommendations: string | null;
  decision: string | null;
  decisionNotes: string | null;
  newPlanId: string | null;
  therapistSignature: string | null;
  completedAt: string | null;
  createdAt: string;
  episode: {
    id: string;
    title: string;
    status: string;
    totalCompletedSessions: number;
    sessionsSinceReview: number;
    reviewThreshold: number;
    reviewDue: boolean;
    patient: { id: string; patientCode: string; firstName: string; middleName: string | null; lastName: string; phone: string };
    therapist: { firstName: string; lastName: string } | null;
  };
  plan: { id: string; version: number; status: string } | null;
  objectiveResults: ObjectiveResultDto[];
}

export interface ReviewDetailResponse {
  review: ReviewDetail;
  baseline: ClinicalBaseline;
  previousReviews: { id: string; reviewDate: string; decision: string | null; status: string; triggerSessions: number; painCurrent: number | null }[];
}

// ---- Discharges ----

export interface DischargeListItem {
  id: string;
  episodeId: string;
  patientId: string;
  dischargeDate: string;
  status: string;
  reason: string;
  followUpType: string | null;
  completedAt: string | null;
  patient: { id: string; patientCode: string; firstName: string; lastName: string };
  episode: { id: string; title: string; status: string };
}

export interface DischargesListResponse {
  items: DischargeListItem[];
  total: number;
  page: number;
  pageSize: number;
  stats: { draft: number; pending: number; completed: number };
}

export interface DischargeRecommendationDto {
  exerciseName: string;
  instructions: string | null;
  frequency: string | null;
  duration: string | null;
  repetitions: string | null;
  precautions: string | null;
  notes: string | null;
}

export interface DischargeDetail {
  id: string;
  episodeId: string;
  patientId: string;
  dischargeDate: string;
  status: string;
  reason: string;
  finalAssessment: string | null;
  baselineComparison: ComparisonRow[];
  objectiveOutcomes: string | null;
  remainingLimitations: string | null;
  summary: string | null;
  followUpType: string | null;
  followUpDetails: string | null;
  therapistSignature: string | null;
  completedAt: string | null;
  createdAt: string;
  patient: { id: string; patientCode: string; firstName: string; middleName: string | null; lastName: string; phone: string; paymentArrangement: string; currentStatus: string };
  episode: { id: string; title: string; status: string; openedDate: string; closedDate: string | null; totalCompletedSessions: number; sessionsSinceReview: number; reviewThreshold: number };
  recommendations: DischargeRecommendationDto[];
}

export interface DischargeDetailResponse {
  discharge: DischargeDetail;
  baseline: ClinicalBaseline;
}

// Decision → badge tone (no STATUS_TONE entries for decisions)
export const DECISION_TONE: Record<string, string> = {
  CONTINUE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  MODIFY_INTERVENTIONS: "bg-sky-50 text-sky-700 border-sky-200",
  MODIFY_OBJECTIVES: "bg-sky-50 text-sky-700 border-sky-200",
  ADJUST_FREQUENCY: "bg-sky-50 text-sky-700 border-sky-200",
  REVISE_PLAN: "bg-amber-50 text-amber-700 border-amber-200",
  REFER: "bg-amber-50 text-amber-700 border-amber-200",
  DISCHARGE: "bg-rose-50 text-rose-700 border-rose-200",
};

// Simple textual change heuristic for comparison rows
export function parseNumber(text: string): number | null {
  const m = /-?\d+(\.\d+)?/.exec(text || "");
  return m ? parseFloat(m[0]) : null;
}

export function changeFor(row: ComparisonRow): { text: string; tone: "success" | "danger" | "neutral" } {
  if (!row.current || row.baseline === "—") return { text: "—", tone: "neutral" };
  const b = parseNumber(row.baseline);
  const c = parseNumber(row.current);
  if (b === null || c === null) return { text: "—", tone: "neutral" };
  const d = Math.round((c - b) * 10) / 10;
  if (d === 0) return { text: "No change", tone: "neutral" };
  const improving = row.direction === "lower" ? d < 0 : d > 0;
  const delta = d > 0 ? `+${d}` : `${d}`;
  return improving ? { text: `${delta} · Improving`, tone: "success" } : { text: `${delta} · Declining`, tone: "danger" };
}
