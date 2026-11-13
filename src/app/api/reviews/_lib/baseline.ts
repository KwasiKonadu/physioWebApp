// ============ Private lib for reviews/discharges: clinical baseline snapshot ============
// Shared by /api/reviews and /api/discharges (both owned by this module).
import { db, parseJson, ApiError } from "@/server/api-exports";
import { FUNCTIONAL_DIFFICULTY_LABELS } from "@/lib/constants";

export interface ComparisonRow {
  metric: string;
  baseline: string;
  current: string;
  change?: string;
  // "higher" => higher value is improving (ROM/strength); "lower" => lower value is improving (pain/function)
  direction?: "higher" | "lower";
}

function sideShort(side?: string | null): string {
  if (side === "RIGHT") return "R";
  if (side === "LEFT") return "L";
  if (side === "BILATERAL") return "Bil";
  return "";
}

function deg(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : `${v}°`;
}

/**
 * Build the read-only clinical context (baseline) for a review/discharge form:
 * - latest COMPLETED assessment (pain, ROM, strength, functional, vitals, findings)
 * - active diagnoses
 * - current treatment plan (latest version) with objectives + milestones + interventions
 * - previous COMPLETED reviews (for current-baseline chaining)
 * - comparison rows prefilled from assessment, `current` chained from latest completed review
 * - patient outstanding invoice summary (informational only — never blocks discharge)
 */
export async function buildClinicalBaseline(episodeId: string, clinicId: string) {
  const episode = await db.treatmentEpisode.findFirst({
    where: { id: episodeId, clinicId },
    include: {
      patient: {
        select: {
          id: true, patientCode: true, firstName: true, middleName: true, lastName: true,
          phone: true, paymentArrangement: true, currentStatus: true,
        },
      },
      therapist: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
      assessments: {
        where: { status: "COMPLETED" },
        orderBy: { assessmentDate: "desc" },
        take: 1,
        include: { romMeasurements: true, strengthMeasurements: true, functionalItems: true },
      },
      diagnoses: { where: { status: "ACTIVE" }, orderBy: { diagnosisDate: "desc" } },
      plans: {
        orderBy: { version: "desc" },
        take: 1,
        include: { objectives: { orderBy: { id: "asc" } }, milestones: { orderBy: { id: "asc" } }, interventions: { orderBy: { id: "asc" } } },
      },
      reviews: { where: { status: "COMPLETED" }, orderBy: { reviewDate: "desc" }, take: 5 },
    },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");

  const assessment = episode.assessments[0] || null;
  const latestReview = episode.reviews[0] || null;
  const previousReviews = episode.reviews.map((r) => ({
    id: r.id,
    reviewDate: r.reviewDate,
    decision: r.decision,
    status: r.status,
    triggerSessions: r.triggerSessions,
    painCurrent: r.painCurrent,
    comparison: parseJson<ComparisonRow[]>(r.comparison, []),
  }));

  // ---- Comparison rows: assessment baseline, `current` chained from latest completed review ----
  const prevRows = parseJson<ComparisonRow[]>(latestReview?.comparison, []);
  const prevMap = new Map<string, string>();
  for (const row of prevRows) {
    if (row && typeof row.metric === "string") prevMap.set(row.metric, row.current || "");
  }

  const comparison: ComparisonRow[] = [];
  if (assessment) {
    if (assessment.painCurrent !== null && assessment.painCurrent !== undefined) {
      comparison.push({
        metric: "Pain — current (0-10)",
        baseline: `${assessment.painCurrent}/10`,
        current: latestReview?.painCurrent !== null && latestReview?.painCurrent !== undefined ? `${latestReview.painCurrent}/10` : prevMap.get("Pain — current (0-10)") || "",
        direction: "lower",
      });
    }
    if (assessment.painWorst !== null && assessment.painWorst !== undefined) {
      comparison.push({
        metric: "Pain — worst (0-10)",
        baseline: `${assessment.painWorst}/10`,
        current: prevMap.get("Pain — worst (0-10)") || "",
        direction: "lower",
      });
    }
    for (const r of assessment.romMeasurements) {
      const metric = `${r.bodyPart} ${r.movement}${sideShort(r.side) ? ` (${sideShort(r.side)})` : ""}`;
      comparison.push({
        metric,
        baseline: deg(r.activeRom ?? r.passiveRom),
        current: prevMap.get(metric) || "",
        direction: "higher",
      });
    }
    for (const s of assessment.strengthMeasurements) {
      const metric = `${s.muscleGroup} strength${sideShort(s.side) ? ` (${sideShort(s.side)})` : ""}`;
      comparison.push({
        metric,
        baseline: `Grade ${s.grade}/5`,
        current: prevMap.get(metric) || "",
        direction: "higher",
      });
    }
    for (const f of assessment.functionalItems) {
      const metric = `${f.activity} (function)`;
      comparison.push({
        metric,
        baseline: FUNCTIONAL_DIFFICULTY_LABELS[f.difficulty] || "—",
        current: prevMap.get(metric) || "",
        direction: "lower",
      });
    }
  }

  // ---- Outstanding balance (informational only) ----
  const unpaidInvoices = await db.invoice.findMany({
    where: { patientId: episode.patientId, clinicId, status: { in: ["UNPAID", "PARTIAL"] } },
    select: { invoiceNumber: true, status: true, totalCents: true, paidCents: true },
    orderBy: { issuedAt: "desc" },
    take: 10,
  });
  const outstandingCents = unpaidInvoices.reduce((s, inv) => s + Math.max(0, inv.totalCents - inv.paidCents), 0);

  const a = assessment;
  return {
    episode: {
      id: episode.id,
      title: episode.title,
      status: episode.status,
      openedDate: episode.openedDate,
      totalCompletedSessions: episode.totalCompletedSessions,
      sessionsSinceReview: episode.sessionsSinceReview,
      reviewThreshold: episode.reviewThreshold,
      reviewDue: episode.reviewDue,
    },
    patient: episode.patient,
    therapist: episode.therapist,
    assessment: a
      ? {
          id: a.id,
          assessmentDate: a.assessmentDate,
          primaryComplaint: a.primaryComplaint,
          bodyPart: a.bodyPart,
          affectedSide: a.affectedSide,
          duration: a.duration,
          onset: a.onset,
          cause: a.cause,
          aggravating: a.aggravating,
          relieving: a.relieving,
          pain: {
            current: a.painCurrent, worst: a.painWorst, lowest: a.painLowest,
            location: a.painLocation, type: a.painType, frequency: a.painFrequency, notes: a.painNotes,
          },
          observation: { posture: a.posture, swelling: a.swelling, deformity: a.deformity, skinCondition: a.skinCondition, muscleWasting: a.muscleWasting, gait: a.gait },
          vitals: {
            bloodPressure: a.bloodPressure, heartRate: a.heartRate, respiratoryRate: a.respiratoryRate,
            temperature: a.temperature, oxygenSaturation: a.oxygenSaturation, weightKg: a.weightKg, heightCm: a.heightCm,
          },
          clinicalFindings: a.clinicalFindings,
          impairments: a.impairments,
          functionalLimitations: a.functionalLimitations,
          clinicalImpression: a.clinicalImpression,
          precautions: a.precautions,
          additionalNotes: a.additionalNotes,
          therapistSignature: a.therapistSignature,
          rom: a.romMeasurements.map((r) => ({ bodyPart: r.bodyPart, movement: r.movement, side: r.side, active: r.activeRom, passive: r.passiveRom, normal: r.normalValue, notes: r.notes })),
          strength: a.strengthMeasurements.map((s) => ({ bodyPart: s.bodyPart, muscleGroup: s.muscleGroup, side: s.side, grade: s.grade, notes: s.notes })),
          functional: a.functionalItems.map((f) => ({ activity: f.activity, difficulty: f.difficulty, label: FUNCTIONAL_DIFFICULTY_LABELS[f.difficulty] || "—", notes: f.notes })),
        }
      : null,
    diagnoses: episode.diagnoses.map((d) => ({
      id: d.id, title: d.title, category: d.category, bodyPart: d.bodyPart, affectedSide: d.affectedSide,
      severity: d.severity, explanation: d.explanation, diagnosisDate: d.diagnosisDate,
    })),
    plan: episode.plans[0]
      ? {
          id: episode.plans[0].id,
          version: episode.plans[0].version,
          status: episode.plans[0].status,
          sessionsPerWeek: episode.plans[0].sessionsPerWeek,
          expectedTotalSessions: episode.plans[0].expectedTotalSessions,
          sessionDurationMin: episode.plans[0].sessionDurationMin,
          startDate: episode.plans[0].startDate,
          endDate: episode.plans[0].endDate,
          objectives: episode.plans[0].objectives.map((o) => ({
            id: o.id, description: o.description, baseline: o.baseline, target: o.target,
            unit: o.unit, priority: o.priority, status: o.status, expectedDate: o.expectedDate,
          })),
          milestones: episode.plans[0].milestones.map((m) => ({
            id: m.id, description: m.description, expectedDate: m.expectedDate, status: m.status, notes: m.notes,
          })),
          interventions: episode.plans[0].interventions.map((i) => ({
            id: i.id, name: i.name, description: i.description, frequency: i.frequency, duration: i.duration, instructions: i.instructions,
          })),
        }
      : null,
    previousReviews,
    comparison,
    outstanding: {
      invoiceCount: unpaidInvoices.length,
      outstandingCents,
      invoices: unpaidInvoices.map((i) => ({ invoiceNumber: i.invoiceNumber, status: i.status, totalCents: i.totalCents, paidCents: i.paidCents })),
    },
  };
}

export type ClinicalBaseline = Awaited<ReturnType<typeof buildClinicalBaseline>>;
