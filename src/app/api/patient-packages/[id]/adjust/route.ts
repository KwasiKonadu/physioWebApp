// ============ Patient package manual adjustment (REVERSAL / ADJUSTMENT) — admin operation ============
// sessions is SIGNED: positive returns sessions to the patient (usedSessions decreases),
// negative consumes sessions (usedSessions increases). usedSessions clamped to [0, totalSessions].
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const adjustSchema = z.object({
  type: z.enum(["REVERSAL", "ADJUSTMENT"]),
  sessions: z.number().int().refine((v) => v !== 0, "sessions must be a non-zero integer"),
  description: z.string().max(500).optional(),
  reason: z.string().min(3).max(500),
});

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.packagesManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, adjustSchema);

  const pp = await db.patientPackage.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { package: { select: { name: true } } },
  });
  if (!pp) throw new ApiError(404, "Patient package not found");
  if (pp.status === "CANCELLED") throw new ApiError(409, "Cannot adjust a cancelled package");

  const used = pp.usedSessions - body.sessions; // signed sessions: +n returns, -n consumes
  const newUsed = Math.min(Math.max(0, used), pp.totalSessions);
  const newStatus = newUsed >= pp.totalSessions ? "EXHAUSTED" : pp.status === "EXHAUSTED" ? "ACTIVE" : pp.status;

  await db.$transaction(async (tx) => {
    await tx.patientPackage.update({ where: { id }, data: { usedSessions: newUsed, status: newStatus } });
    await tx.packageTransaction.create({
      data: {
        patientPackageId: id,
        type: body.type,
        sessions: body.sessions,
        description: [body.description, `Reason: ${body.reason}`].filter(Boolean).join(" · ") || "Manual adjustment",
        performedById: auth.userId,
      },
    });
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PACKAGE_ADJUSTED",
    entityType: "PatientPackage",
    entityId: id,
    previousValues: { usedSessions: pp.usedSessions, status: pp.status },
    newValues: { usedSessions: newUsed, status: newStatus, type: body.type, sessions: body.sessions },
    reason: body.reason,
  });

  const updated = await db.patientPackage.findUnique({
    where: { id },
    include: {
      patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true } },
      package: true,
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });
  return json({ patientPackage: updated });
});
