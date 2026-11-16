// Booking form: option types, validation schema and API-shape helpers.
import { z } from "zod";

export const DURATIONS = ["15", "30", "45", "60"] as const;
export const OPEN_EPISODE_BLOCKED = ["DISCHARGED", "DISCONTINUED"];

export interface PatientOption {
  id: string;
  patientCode: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
}

export interface EpisodeOption {
  id: string;
  title: string;
  status: string;
}

export const formSchema = z.object({
  patientId: z.string().min(1, "Select a patient"),
  episodeId: z.string().optional(),
  therapistId: z.string().min(1, "Select a therapist"),
  date: z.string().min(1, "Pick a date"),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Pick a start time"),
  duration: z.enum(DURATIONS),
  purpose: z.string().min(1, "Select a purpose"),
  purposeOther: z.string().max(120).optional(),
  notes: z.string().max(4000).optional(),
  walkIn: z.boolean(),
}).refine((v) => v.purpose !== "Other" || (v.purposeOther || "").trim().length > 0, {
  message: "Describe the purpose",
  path: ["purposeOther"],
});

export type FormValues = z.infer<typeof formSchema>;

/** Tolerant extraction — the Patients module API shape may evolve. */
export function extractBundle(res: unknown): { patient: PatientOption | null; episodes: EpisodeOption[] } {
  if (!res || typeof res !== "object") return { patient: null, episodes: [] };
  const r = res as Record<string, unknown>;
  const src = (r.patient && typeof r.patient === "object" ? (r.patient as Record<string, unknown>) : r);
  const rawEpisodes = (r.episodes ?? src.episodes ?? []) as Record<string, unknown>[];
  const episodes = Array.isArray(rawEpisodes)
    ? rawEpisodes.filter((e) => e && e.id).map((e) => ({ id: String(e.id), title: String(e.title ?? "Episode"), status: String(e.status ?? "") }))
    : [];
  const p = src as Record<string, unknown>;
  const patient = p.patientCode || p.firstName
    ? { id: String(p.id ?? ""), patientCode: String(p.patientCode ?? ""), firstName: String(p.firstName ?? ""), lastName: String(p.lastName ?? ""), phone: (p.phone as string) ?? null }
    : null;
  return { patient, episodes };
}
