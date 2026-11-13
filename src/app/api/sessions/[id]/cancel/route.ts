// ============ API: Cancel therapy session / mark no-show (never deducts packages — sessions only deduct on completion) ============
import { z } from "zod";
import { PERMS, labelize } from "@/lib/constants";
import {
  db, route, json, parseBody, ApiError, audit,
  requirePermission,
} from "@/server/api-exports";

const cancelSchema = z.object({
  reason: z.string().max(1000).optional(),
  markAs: z.enum(["CANCELLED", "NO_SHOW"]).optional(),
});

const detailInclude = {
  episode: {
    select: {
      id: true,
      title: true,
      status: true,
      sessionsSinceReview: true,
      reviewThreshold: true,
      reviewDue: true,
      patient: { select: { id: true, patientCode: true, firstName: true, lastName: true } },
    },
  },
  therapist: { select: { id: true, firstName: true, lastName: true } },
  interventions: true,
  appointment: { select: { id: true, date: true, startMin: true } },
};

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, cancelSchema);

  const session = await db.therapySession.findUnique({ where: { id } });
  if (!session || session.clinicId !== auth.clinicId) {
    throw new ApiError(404, "Therapy session not found");
  }
  if (session.status !== "PLANNED" && session.status !== "IN_PROGRESS") {
    throw new ApiError(409, `Only planned or in-progress sessions can be cancelled (current: ${labelize(session.status)})`);
  }

  const markAs = body.markAs || "CANCELLED";
  const reason = body.reason?.trim() || undefined;
  const suffix = reason ? `[${labelize(markAs)}] ${reason}` : `[${labelize(markAs)}]`;
  const notes = session.notes ? `${session.notes}\n${suffix}` : suffix;

  const updated = await db.therapySession.update({
    where: { id },
    data: { status: markAs, notes },
    include: detailInclude,
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "SESSION_CANCELLED",
    entityType: "TherapySession",
    entityId: id,
    previousValues: { status: session.status },
    newValues: { status: markAs },
    reason,
  });

  return json(updated);
});
