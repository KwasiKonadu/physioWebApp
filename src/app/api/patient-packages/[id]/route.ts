// ============ Patient package detail (ledger) + cancel ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingView);
  const { id } = await ctx.params;
  const pp = await db.patientPackage.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true, phone: true, paymentArrangement: true } },
      package: true,
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!pp) throw new ApiError(404, "Patient package not found");

  // linked package-purchase invoice (item.serviceId stores the packageId — no FK)
  const invoice = await db.invoice.findFirst({
    where: {
      patientId: pp.patientId,
      arrangement: "PACKAGE",
      items: { some: { serviceId: pp.packageId } },
    },
    orderBy: { issuedAt: "desc" },
    select: { id: true, invoiceNumber: true, status: true, totalCents: true, paidCents: true, issuedAt: true },
  });

  return json({
    patientPackage: {
      ...pp,
      remaining: pp.totalSessions - pp.usedSessions,
      invoice: invoice || null,
    },
  });
});

const patchSchema = z.object({
  action: z.literal("cancel"),
  reason: z.string().max(500).optional(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.packagesManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const pp = await db.patientPackage.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { package: { select: { name: true } }, patient: { select: { firstName: true, lastName: true, patientCode: true } } },
  });
  if (!pp) throw new ApiError(404, "Patient package not found");
  if (pp.status === "CANCELLED") throw new ApiError(409, "Package is already cancelled");

  const reason = body.reason?.trim();

  await db.$transaction(async (tx) => {
    await tx.patientPackage.update({ where: { id }, data: { status: "CANCELLED" } });
    await tx.packageTransaction.create({
      data: {
        patientPackageId: id,
        type: "CANCELLED",
        sessions: 0,
        description: reason ? `Package cancelled — ${reason}` : "Package cancelled",
        performedById: auth.userId,
      },
    });
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PACKAGE_CANCELLED",
    entityType: "PatientPackage",
    entityId: id,
    previousValues: { status: pp.status, usedSessions: pp.usedSessions },
    newValues: { status: "CANCELLED" },
    reason,
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
