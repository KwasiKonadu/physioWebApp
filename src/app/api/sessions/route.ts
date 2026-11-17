// ============ API: Therapy sessions — list (+ header stats) & manual creation ============
import { assertAssessmentCompleted } from "@/server/services/shared";
import { z } from "zod";
import { PERMS, SESSION_STATUSES, labelize } from "@/lib/constants";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError,
  requireAuth, requirePermission,
} from "@/server/api-exports";

// Episodes in these states can no longer receive sessions (Business Rule: episode workflow)
const CLOSED_EPISODE_STATUSES = ["DISCHARGED", "DISCONTINUED"];

const listInclude = {
  episode: {
    select: {
      id: true,
      title: true,
      status: true,
      sessionsSinceReview: true,
      reviewThreshold: true,
      reviewDue: true,
      patient: { select: { patientCode: true, firstName: true, lastName: true } },
    },
  },
  therapist: { select: { firstName: true, lastName: true } },
  interventions: true,
  appointment: { select: { id: true, date: true, startMin: true } },
};

/** Parse a yyyy-mm-dd (or full ISO) query param into a Date, undefined if absent/invalid. */
function parseDateParam(value: string | null, endOfDay = false): Date | undefined {
  if (!value) return undefined;
  const iso = value.length === 10 ? `${value}${endOfDay ? "T23:59:59.999" : "T00:00:00.000"}` : value;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(Math.max(1, getQueryInt(req, "pageSize", 20)), 100);

  const episodeId = getQuery(req, "episodeId");
  const patientId = getQuery(req, "patientId");
  const therapistId = getQuery(req, "therapistId");
  const status = getQuery(req, "status");
  const from = getQuery(req, "from");
  const to = getQuery(req, "to");

  if (status && !(SESSION_STATUSES as readonly string[]).includes(status)) {
    throw new ApiError(400, `Invalid status filter — expected one of: ${SESSION_STATUSES.join(", ")}`);
  }

  const fromDate = parseDateParam(from);
  const toDate = parseDateParam(to, true);

  const base = {
    clinicId: auth.clinicId,
    ...(episodeId ? { episodeId } : {}),
    ...(patientId ? { patientId } : {}),
    ...(therapistId ? { therapistId } : {}),
  };
  const dateFilter = fromDate || toDate ? { date: { ...(fromDate ? { gte: fromDate } : {}), ...(toDate ? { lte: toDate } : {}) } } : {};
  const where = { ...base, ...dateFilter, ...(status ? { status } : {}) };

  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

  const [items, total, completed, planned, today] = await Promise.all([
    db.therapySession.findMany({
      where,
      orderBy: [{ date: "desc" }, { timeMin: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: listInclude,
    }),
    db.therapySession.count({ where }),
    // Header stat cards — always measured over the filtered base (ignoring the status filter)
    db.therapySession.count({ where: { ...base, ...dateFilter, status: "COMPLETED" } }),
    db.therapySession.count({ where: { ...base, ...dateFilter, status: { in: ["PLANNED", "IN_PROGRESS"] } } }),
    db.therapySession.count({
      where: { ...base, date: { gte: day0, lte: dayEnd }, status: { notIn: ["CANCELLED", "NO_SHOW"] } },
    }),
  ]);

  return json({ items, total, page, pageSize, stats: { completed, planned, today } });
});

const createSchema = z.object({
  episodeId: z.string().min(1, "Episode is required"),
  therapistId: z.string().min(1).optional(),
  date: z.string().min(1, "Date is required"),
  timeMin: z.number().int().min(0).max(1439).optional(),
  durationMin: z.number().int().min(1).max(600).optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS"]).optional(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const body = await parseBody(req, createSchema);

  const episode = await db.treatmentEpisode.findFirst({
    where: { id: body.episodeId, clinicId: auth.clinicId },
  });
  if (!episode) throw new ApiError(404, "Treatment episode not found");
  if (CLOSED_EPISODE_STATUSES.includes(episode.status)) {
    throw new ApiError(409, `Cannot add sessions to a ${labelize(episode.status)} episode`);
  }

  assertAssessmentCompleted(episode.status);

  const therapistId = body.therapistId || episode.therapistId;
  if (!therapistId) {
    throw new ApiError(400, "No therapist available — provide a therapistId or assign a therapist to the episode");
  }
  const therapist = await db.staffProfile.findFirst({ where: { id: therapistId, clinicId: auth.clinicId } });
  if (!therapist) throw new ApiError(400, "Therapist not found");

  const date = new Date(body.date);
  if (Number.isNaN(date.getTime())) throw new ApiError(400, "Invalid date — use YYYY-MM-DD or an ISO datetime");

  const created = await db.therapySession.create({
    data: {
      clinicId: auth.clinicId,
      episodeId: episode.id,
      patientId: episode.patientId,
      therapistId,
      date,
      timeMin: body.timeMin ?? null,
      durationMin: body.durationMin ?? null,
      status: body.status || "PLANNED",
    },
    include: listInclude,
  });

  return json(created, 201);
});
