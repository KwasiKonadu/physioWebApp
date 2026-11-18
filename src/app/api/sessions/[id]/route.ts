// ============ API: Therapy session — full detail (+ package deduction ledger) & documentation save ============
import { z } from "zod";
import { PERMS, labelize } from "@/lib/constants";
import {
  db, route, json, parseBody, ApiError, audit,
  requireAuth, requirePermission,
} from "@/server/api-exports";

const detailInclude = {
  episode: {
    select: {
      id: true,
      title: true,
      status: true,
      openedDate: true,
      sessionsSinceReview: true,
      reviewThreshold: true,
      reviewDue: true,
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
    },
  },
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true, paymentArrangement: true } },
  therapist: { select: { id: true, firstName: true, lastName: true } },
  interventions: true,
  vitals: { orderBy: { createdAt: "asc" as const } },
  appointment: { select: { id: true, date: true, startMin: true, endMin: true, status: true, purpose: true } },
};

const ledgerInclude = {
  patientPackage: {
    include: { package: { select: { name: true, sessions: true } } },
  },
};

async function loadLedger(sessionId: string) {
  // PackageTransaction.sessionId is a plain string idempotency key (unique per [sessionId, type])
  return db.packageTransaction.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    include: ledgerInclude,
  });
}

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;

  const session = await db.therapySession.findUnique({
    where: { id },
    include: detailInclude,
  });
  if (!session || session.clinicId !== auth.clinicId) {
    throw new ApiError(404, "Therapy session not found");
  }

  const packageTransactions = await loadLedger(id);
  return json({ session, packageTransactions });
});

const patchSchema = z.object({
  painLevel: z.number().int().min(0).max(10).nullish(),
  painLevelEnd: z.number().int().min(0).max(10).nullish(),
  vitals: z.array(z.object({
    phase: z.enum(["START", "END"]),
    name: z.string().trim().min(1).max(60),
    value: z.string().trim().min(1).max(40),
    unit: z.string().trim().max(20).nullish(),
  })).max(40).optional(),
  patientResponse: z.string().max(2000).nullish(),
  observations: z.string().max(4000).nullish(),
  notes: z.string().max(4000).nullish(),
  durationMin: z.number().int().min(1).max(600).nullish(),
  date: z.string().min(1).nullish(),
  timeMin: z.number().int().min(0).max(1439).nullish(),
  interventions: z.array(z.object({
    name: z.string().min(1, "Intervention name is required"),
    details: z.string().max(500).optional(),
  })).max(30).optional(),
  status: z.enum(["PLANNED", "IN_PROGRESS"]).optional(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const session = await db.therapySession.findUnique({ where: { id } });
  if (!session || session.clinicId !== auth.clinicId) {
    throw new ApiError(404, "Therapy session not found");
  }
  // Only draft-equivalent statuses are editable (Business Rule 4)
  if (session.status !== "PLANNED" && session.status !== "IN_PROGRESS") {
    throw new ApiError(409, `A ${labelize(session.status)} session can no longer be edited`);
  }

  let statusChanged = false;
  if (body.status && body.status !== session.status) {
    if (!(session.status === "PLANNED" && body.status === "IN_PROGRESS")) {
      throw new ApiError(409, `Invalid status transition: ${session.status} → ${body.status}`);
    }
    statusChanged = true;
  }

  // Build scalar update data — only include explicitly provided keys (null clears the field)
  const data: Record<string, unknown> = {};
  if ("painLevel" in body) data.painLevel = body.painLevel;
  if ("painLevelEnd" in body) data.painLevelEnd = body.painLevelEnd;
  if ("patientResponse" in body) data.patientResponse = body.patientResponse?.trim() || null;
  if ("observations" in body) data.observations = body.observations?.trim() || null;
  if ("notes" in body) data.notes = body.notes?.trim() || null;
  if ("durationMin" in body) data.durationMin = body.durationMin;
  if ("timeMin" in body) data.timeMin = body.timeMin;
  if (body.date) {
    const date = new Date(body.date);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, "Invalid date — use YYYY-MM-DD or an ISO datetime");
    data.date = date;
  }
  if (body.status) data.status = body.status;

  const updated = await db.$transaction(async (tx) => {
    if (body.interventions) {
      // Delivered interventions are replaced wholesale
      await tx.sessionIntervention.deleteMany({ where: { sessionId: id } });
      const rows = body.interventions.filter((i) => i.name.trim().length > 0);
      if (rows.length) {
        await tx.sessionIntervention.createMany({
          data: rows.map((i) => ({ sessionId: id, name: i.name.trim(), details: i.details?.trim() || null })),
        });
      }
    }
    if (body.vitals) {
      await tx.sessionVital.deleteMany({ where: { sessionId: id } });
      if (body.vitals.length) await tx.sessionVital.createMany({ data: body.vitals.map((v) => ({ sessionId: id, phase: v.phase, name: v.name, value: v.value, unit: v.unit?.trim() || null })) });
    }
    return tx.therapySession.update({
      where: { id },
      data: data as never,
      include: detailInclude,
    });
  });

  // Keep audit light: log only status transitions, not routine documentation saves
  if (statusChanged) {
    await audit({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userName: auth.name,
      action: "SESSION_UPDATED",
      entityType: "TherapySession",
      entityId: id,
      previousValues: { status: session.status },
      newValues: { status: body.status },
    });
  }

  return json(updated);
});
