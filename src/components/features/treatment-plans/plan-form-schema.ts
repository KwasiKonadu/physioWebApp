// Treatment plan form: schema, value types and small parsing helpers.
import { z } from "zod";

export const OBJECTIVE_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const CUSTOM_SENTINEL = "__custom__";

// ---------- schema ----------
export const objectiveRowSchema = z.object({
  description: z.string().min(1, "Description is required"),
  baseline: z.string(),
  target: z.string(),
  unit: z.string(),
  priority: z.string(),
  expectedDate: z.string(),
});
export const milestoneRowSchema = z.object({
  description: z.string().min(1, "Description is required"),
  objectiveIdx: z.string(),
  expectedDate: z.string(),
  status: z.string(),
});
export const interventionRowSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string(),
  frequency: z.string(),
  duration: z.string(),
  instructions: z.string(),
  notes: z.string(),
});

export const buildSchema = (mode: "create" | "edit" | "revise") =>
  z.object({
    episodeId: mode === "create" ? z.string().min(1, "Select an episode for this plan") : z.string(),
    objectives: z.array(objectiveRowSchema).max(30),
    milestones: z.array(milestoneRowSchema).max(30),
    interventions: z.array(interventionRowSchema).max(30),
    sessionsPerWeek: z.string(),
    expectedTotalSessions: z.string(),
    sessionDurationMin: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reviewThresholdSessions: z.string(),
    contraindications: z.string(),
    restrictions: z.string(),
    activitiesToAvoid: z.string(),
    specialPrecautions: z.string(),
    patientRecommendations: z.string(),
    referralInstructions: z.string(),
    changeReason: mode === "revise" ? z.string().min(1, "A change reason is required") : z.string(),
  });

export type FormValues = z.infer<ReturnType<typeof buildSchema>>;

export const emptyObjective = { description: "", baseline: "", target: "", unit: "", priority: "", expectedDate: "" };
export const emptyMilestone = { description: "", objectiveIdx: "", expectedDate: "", status: "PENDING" };
export const emptyIntervention = { name: "", description: "", frequency: "", duration: "", instructions: "", notes: "" };

export function intOrNull(v: string): number | null {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function dateOrNull(v: string): string | null {
  return v && v.trim() ? v : null;
}
