// ============ Treatment episode: detail + status transitions (hold / resume / discontinue) ============
import { Prisma } from "@prisma/client";
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, requireAuth, requirePermission, parseJson, syncPatientStatus,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

// ---- helpers ----
const optStr = (max = 255) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().max(max).optional());

type HoldEntry = { date: string; reason: string; notes?: string };
const NO_HOLDS: HoldEntry[] = [];

const CLOSED_STATUSES = ["DISCHARGED", "DISCONTINUED"];

// ---- GET: episode detail with therapist, patient summary, counts ----
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;

  const episode = await db.treatmentEpisode.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      therapist: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
      patient: {
        select: {
          id: true, patientCode: true, firstName: true, middleName: true, lastName: true,
          gender: true, dateOfBirth: true, phone: true, email: true,
          paymentArrangement: true, currentStatus: true,
        },
      },
      _count: {
        select: { sessions: true, assessments: true, plans: true, reviews: true, appointments: true, diagnoses: true },
      },
    },
  });
  if (!episode) throw new ApiError(404, "Episode not found");

  const [lastAssessment, activePlan] = await Promise.all([
    db.assessment.findFirst({
      where: { episodeId: id },
      orderBy: { assessmentDate: "desc" },
      select: { id: true, status: true, assessmentDate: true },
    }),
    db.treatmentPlan.findFirst({
      where: { episodeId: id, status: { in: ["ACTIVE", "UNDER_REVIEW"] } },
      select: { id: true, status: true, version: true },
    }),
  ]);

  return json({
    ...episode,
    holdHistory: parseJson(episode.holdHistory, NO_HOLDS),
    clinicalState: { lastAssessment, activePlan },
  });
});

// ---- PATCH: transitions + field updates ----
const patchSchema = z.object({
  action: z.enum(["place_on_hold", "resume", "discontinue"]).optional(),
  reason: optStr(500),
  notes: optStr(2000),
  title: optStr(160),
  therapistId: optStr(64),
  branchId: optStr(64),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const episode = await db.treatmentEpisode.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!episode) throw new ApiError(404, "Episode not found");

  const data: Prisma.TreatmentEpisodeUpdateInput = {};
  let auditAction = "EPISODE_UPDATED";
  const now = new Date();

  if (body.action === "place_on_hold") {
    if (!body.reason) throw new ApiError(400, "A reason is required to place an episode on hold");
    if (CLOSED_STATUSES.includes(episode.status)) throw new ApiError(409, "Cannot place a closed episode on hold");
    if (episode.status === "ON_HOLD") throw new ApiError(409, "Episode is already on hold");
    const history = parseJson<HoldEntry[]>(episode.holdHistory, NO_HOLDS);
    history.push({ date: now.toISOString(), reason: body.reason, ...(body.notes ? { notes: body.notes } : {}) });
    data.status = "ON_HOLD";
    data.holdHistory = JSON.stringify(history);
    auditAction = "EPISODE_ON_HOLD";
  } else if (body.action === "resume") {
    if (episode.status !== "ON_HOLD") throw new ApiError(409, "Episode is not on hold");
    // recompute the clinical state from actual data
    const [completedAssessment, activePlan] = await Promise.all([
      db.assessment.findFirst({ where: { episodeId: id, status: "COMPLETED" }, select: { id: true } }),
      db.treatmentPlan.findFirst({
        where: { episodeId: id, status: { in: ["ACTIVE", "UNDER_REVIEW"] } },
        select: { id: true },
      }),
    ]);
    data.status = activePlan ? "ACTIVE_TREATMENT" : completedAssessment ? "AWAITING_PLAN" : "AWAITING_ASSESSMENT";
    auditAction = "EPISODE_RESUMED";
  } else if (body.action === "discontinue") {
    if (!body.reason) throw new ApiError(400, "A reason is required to discontinue an episode");
    if (CLOSED_STATUSES.includes(episode.status)) throw new ApiError(409, "Episode is already closed");
    data.status = "DISCONTINUED";
    data.closedDate = now;
    auditAction = "EPISODE_DISCONTINUED";
  }

  // optional field updates (allowed alongside or without an action)
  if (body.title !== undefined) data.title = body.title;
  if (body.notes !== undefined) data.notes = body.notes ?? null;
  if (body.therapistId !== undefined) {
    if (body.therapistId) {
      const therapist = await db.staffProfile.findFirst({
        where: { id: body.therapistId, clinicId: auth.clinicId },
        select: { id: true },
      });
      if (!therapist) throw new ApiError(400, "Selected therapist is invalid");
      data.therapist = { connect: { id: body.therapistId } };
    } else {
      data.therapist = { disconnect: true };
    }
  }
  if (body.branchId !== undefined) {
    data.branchId = body.branchId ?? null;
  }

  const updated = await db.treatmentEpisode.update({
    where: { id },
    data,
    include: { therapist: { select: { id: true, firstName: true, lastName: true } } },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: auditAction,
    entityType: "TreatmentEpisode",
    entityId: id,
    previousValues: { status: episode.status, title: episode.title, therapistId: episode.therapistId },
    newValues: {
      status: updated.status,
      title: updated.title,
      therapistId: updated.therapistId,
      reason: body.reason || null,
    },
    reason: body.reason || undefined,
  });

  await syncPatientStatus(episode.patientId);

  return json({
    ...updated,
    holdHistory: parseJson(updated.holdHistory, NO_HOLDS),
  });
});
