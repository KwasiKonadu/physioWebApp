// ============ /api/plans — list & create treatment plans ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt,
  ApiError, audit, notify, getSetting,
  requireAuth, requirePermission, syncPatientStatus, patientSearchAnd,
} from "@/server/api-exports";
import { PERMS, DEFAULT_REVIEW_THRESHOLD } from "@/lib/constants";
import {
  createPlanTx, findPlanableEpisode, maxPlanVersion, toPlanSummary,
  type InterventionInput, type MilestoneInput, type ObjectiveInput,
} from "./plan-service";

// ---- zod schemas (lenient transforms: numbers may arrive as strings, dates as "yyyy-mm-dd") ----
const optInt = z.union([z.number(), z.string(), z.null()]).optional()
  .transform((v) => (v === null || v === undefined || v === "" ? null : Number(v)))
  .refine((v) => v === null || (Number.isFinite(v) && Number.isInteger(v) && v > 0), "Must be a positive whole number");

const optDate = z.union([z.string(), z.null()]).optional()
  .transform((v) => (v ? new Date(v) : null))
  .refine((v) => v === null || !Number.isNaN(v.getTime()), "Invalid date");

const optStr = z.union([z.string(), z.null()]).optional()
  .transform((v) => (v === undefined || v === null || v.trim() === "" ? null : v.trim()));

const objectiveSchema = z.object({
  description: z.string().min(1, "Objective description is required"),
  baseline: optStr, target: optStr, unit: optStr,
  priority: z.union([z.literal("HIGH"), z.literal("MEDIUM"), z.literal("LOW"), z.null()]).optional(),
  expectedDate: optDate,
  status: z.string().optional(),
  notes: optStr,
});

const milestoneSchema = z.object({
  description: z.string().min(1, "Milestone description is required"),
  objectiveIdx: optInt,
  expectedDate: optDate,
  status: z.string().optional(),
  notes: optStr,
});

const interventionSchema = z.object({
  name: z.string().min(1, "Intervention name is required"),
  description: optStr, frequency: optStr, duration: optStr, instructions: optStr, notes: optStr,
});

const precautionsSchema = z.object({
  contraindications: optStr, restrictions: optStr, activitiesToAvoid: optStr,
  specialPrecautions: optStr, patientRecommendations: optStr, referralInstructions: optStr,
}).optional();

const createSchema = z.object({
  episodeId: z.string().min(1, "episodeId is required"),
  status: z.enum(["DRAFT", "ACTIVE"]).default("DRAFT"),
  sessionsPerWeek: optInt, expectedTotalSessions: optInt, sessionDurationMin: optInt,
  startDate: optDate, endDate: optDate,
  reviewThresholdSessions: optInt,
  objectives: z.array(objectiveSchema).max(30).default([]),
  milestones: z.array(milestoneSchema).max(30).default([]),
  interventions: z.array(interventionSchema).max(30).default([]),
  precautions: precautionsSchema,
});

// ---- GET /api/plans — paginated list with episode/patient/status/search filters ----
export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 20)));
  const episodeId = getQuery(req, "episodeId");
  const patientId = getQuery(req, "patientId");
  const status = getQuery(req, "status");
  const search = getQuery(req, "search")?.trim();

  const episodeWhere: Record<string, unknown> = {};
  if (patientId) episodeWhere.patientId = patientId;
  if (search) episodeWhere.patient = { AND: patientSearchAnd(search) };

  const where = {
    clinicId: auth.clinicId,
    ...(episodeId ? { episodeId } : {}),
    ...(status ? { status } : {}),
    ...(Object.keys(episodeWhere).length ? { episode: episodeWhere } : {}),
  };

  const wantStats = getQuery(req, "stats") === "true";
  const [rows, total, statusGroups] = await Promise.all([
    db.treatmentPlan.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        episode: {
          select: {
            id: true, title: true, status: true, totalCompletedSessions: true,
            sessionsSinceReview: true, reviewThreshold: true, reviewDue: true,
            patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
            therapist: { select: { id: true, staffCode: true, firstName: true, lastName: true } },
          },
        },
        objectives: { select: { status: true } },
        milestones: { select: { id: true } },
        interventions: { select: { id: true } },
      },
    }),
    db.treatmentPlan.count({ where }),
    // clinic-wide counts by status, only when asked for (KPI cards) — replaces 4 count-only list calls
    wantStats
      ? db.treatmentPlan.groupBy({ by: ["status"], where: { clinicId: auth.clinicId }, _count: { _all: true } })
      : Promise.resolve(null),
  ]);

  const stats = statusGroups
    ? (() => {
        const by = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all]));
        return { total: statusGroups.reduce((s, g) => s + g._count._all, 0), active: by.ACTIVE ?? 0, draft: by.DRAFT ?? 0, review: by.UNDER_REVIEW ?? 0 };
      })()
    : undefined;
  return json({ items: rows.map(toPlanSummary), total, page, pageSize, ...(stats ? { stats } : {}) });
});

// ---- POST /api/plans — create a plan version (DRAFT, or ACTIVE with immediate activation) ----
export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const body = await parseBody(req, createSchema);

  const episode = await findPlanableEpisode(body.episodeId, auth.clinicId);

  // clinic-level default review threshold
  let reviewThresholdSessions = body.reviewThresholdSessions;
  if (reviewThresholdSessions == null) {
    reviewThresholdSessions = Number(await getSetting(auth.clinicId, "reviewThreshold", String(DEFAULT_REVIEW_THRESHOLD))) || DEFAULT_REVIEW_THRESHOLD;
  }

  const plan = await db.$transaction(async (tx) => {
    const version = (await maxPlanVersion(tx, episode.id)) + 1;
    const created = await createPlanTx(tx, {
      clinicId: auth.clinicId,
      episodeId: episode.id,
      version,
      status: body.status,
      createdById: auth.userId,
      schedule: {
        sessionsPerWeek: body.sessionsPerWeek,
        expectedTotalSessions: body.expectedTotalSessions,
        sessionDurationMin: body.sessionDurationMin,
        startDate: body.startDate,
        endDate: body.endDate,
        reviewThresholdSessions,
      },
      precautions: body.precautions || {},
      objectives: body.objectives as ObjectiveInput[],
      milestones: body.milestones as MilestoneInput[],
      interventions: body.interventions as InterventionInput[],
    });

    // immediate activation: enforce single governing version + episode transition
    if (body.status === "ACTIVE") {
      await tx.treatmentPlan.updateMany({
        where: { episodeId: episode.id, id: { not: created.id }, status: { in: ["ACTIVE", "UNDER_REVIEW"] } },
        data: { status: "REVISED" },
      });
      await tx.treatmentEpisode.update({
        where: { id: episode.id },
        data: { status: "ACTIVE_TREATMENT", reviewThreshold: created.reviewThresholdSessions },
      });
    }
    return created;
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "PLAN_CREATED", entityType: "TreatmentPlan", entityId: plan.id,
    newValues: { version: plan.version, status: plan.status, episodeId: episode.id },
  });

  if (body.status === "ACTIVE") {
    const fresh = await db.treatmentEpisode.findUnique({ where: { id: episode.id }, select: { patientId: true } });
    if (fresh) await syncPatientStatus(fresh.patientId);
    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "PLAN_ACTIVATED", entityType: "TreatmentPlan", entityId: plan.id,
      newValues: { version: plan.version, status: "ACTIVE", activatedAt: plan.activatedAt },
    });
    await notify({
      clinicId: auth.clinicId, audienceRole: "PHYSIOTHERAPIST",
      type: "PLAN_ACTIVATED", title: "Treatment plan activated",
      message: `v${plan.version} plan activated for ${episode.patient.firstName} ${episode.patient.lastName} — episode is now in active treatment.`,
      entityType: "TreatmentPlan", entityId: plan.id,
    });
  }

  const detail = await db.treatmentPlan.findUnique({
    where: { id: plan.id },
    include: {
      objectives: true, milestones: true, interventions: true,
      episode: { select: { id: true, title: true, status: true, patient: true, therapist: { select: { id: true, staffCode: true, firstName: true, lastName: true } } } },
    },
  });
  if (!detail) throw new ApiError(500, "Plan creation failed");
  return json(detail, 201);
});
