// ============ Patient packages: list + stats + purchase (Business Rule 4) ============
// NOTE: session DEDUCTIONS happen ONLY in the therapy-session completion flow (shared services) — no deduction endpoints here.
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit, notify,
  requirePermission, nextInvoiceNumber, recalcInvoiceStatus,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingView);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 200);
  const patientId = getQuery(req, "patientId");
  const status = getQuery(req, "status");

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;

  const now = new Date();
  const in14 = new Date(now);
  in14.setDate(in14.getDate() + 14);
  in14.setHours(23, 59, 59, 999);

  const [items, total, activeCount, exhaustedCount, expiringSoon] = await Promise.all([
    db.patientPackage.findMany({
      where,
      orderBy: { purchaseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true, paymentArrangement: true } },
        package: { select: { id: true, name: true, sessions: true, priceCents: true, validityDays: true } },
      },
    }),
    db.patientPackage.count({ where }),
    db.patientPackage.count({ where: { clinicId: auth.clinicId, status: "ACTIVE" } }),
    db.patientPackage.count({ where: { clinicId: auth.clinicId, status: "EXHAUSTED" } }),
    db.patientPackage.count({
      where: { clinicId: auth.clinicId, status: "ACTIVE", expiryDate: { gte: now, lte: in14 } },
    }),
  ]);

  return json({
    items: items.map((pp) => ({
      ...pp,
      remaining: pp.totalSessions - pp.usedSessions,
    })),
    total,
    page,
    pageSize,
    stats: { active: activeCount, exhausted: exhaustedCount, expiringSoon },
  });
});

const purchaseSchema = z.object({
  patientId: z.string().min(1),
  packageId: z.string().min(1),
  purchaseDate: z.string().optional(),
  amountPaidCents: z.number().int().min(0).optional(),
  createInvoice: z.boolean().default(false),
  method: z.enum(["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "INSURANCE"]).optional(),
  notes: z.string().max(1000).optional(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingManage);
  const body = await parseBody(req, purchaseSchema);

  const [patient, pkg] = await Promise.all([
    db.patient.findFirst({ where: { id: body.patientId, clinicId: auth.clinicId } }),
    db.packageDefinition.findFirst({ where: { id: body.packageId, clinicId: auth.clinicId } }),
  ]);
  if (!patient) throw new ApiError(404, "Patient not found");
  if (!pkg) throw new ApiError(404, "Package definition not found");
  if (!pkg.active) throw new ApiError(400, "Package is inactive and cannot be sold");

  const purchaseDate = body.purchaseDate ? new Date(body.purchaseDate) : new Date();
  const expiryDate = new Date(purchaseDate);
  expiryDate.setDate(expiryDate.getDate() + pkg.validityDays);
  const amountPaidCents = body.amountPaidCents ?? pkg.priceCents;
  const invoiceNumber = body.createInvoice ? await nextInvoiceNumber(auth.clinicId) : null;

  const created = await db.$transaction(async (tx) => {
    const pp = await tx.patientPackage.create({
      data: {
        clinicId: auth.clinicId,
        patientId: patient.id,
        packageId: pkg.id,
        purchaseDate,
        expiryDate,
        totalSessions: pkg.sessions,
        usedSessions: 0,
        amountPaidCents,
        status: "ACTIVE",
      },
    });

    await tx.packageTransaction.create({
      data: {
        patientPackageId: pp.id,
        type: "PURCHASE",
        sessions: pkg.sessions,
        amountCents: amountPaidCents,
        description: `Package purchased — ${pkg.name} (${pkg.sessions} sessions)`,
        performedById: auth.userId,
      },
    });

    if (body.createInvoice && invoiceNumber) {
      const invoice = await tx.invoice.create({
        data: {
          clinicId: auth.clinicId,
          invoiceNumber,
          patientId: patient.id,
          arrangement: "PACKAGE",
          status: "UNPAID",
          subtotalCents: pkg.priceCents,
          discountCents: 0,
          totalCents: pkg.priceCents,
          paidCents: 0,
          insuranceCoveredCents: 0,
          notes: body.notes || `Package purchase — ${pkg.name}`,
          issuedById: auth.userId,
          issuedAt: new Date(),
        },
      });
      await tx.invoiceItem.create({
        data: {
          invoiceId: invoice.id,
          serviceId: pkg.id, // package reference stored on the item (no FK) — enables invoice lookup from ledger
          description: `${pkg.name} — ${pkg.sessions} sessions`,
          quantity: 1,
          unitPriceCents: pkg.priceCents,
        },
      });

      if (amountPaidCents > 0) {
        await tx.payment.create({
          data: {
            clinicId: auth.clinicId,
            invoiceId: invoice.id,
            amountCents: amountPaidCents,
            method: body.method || "CASH",
            reference: body.notes || null,
            receivedById: auth.userId,
          },
        });
        await tx.financialTransaction.create({
          data: {
            clinicId: auth.clinicId,
            patientId: patient.id,
            type: "PACKAGE_PURCHASE",
            amountCents: amountPaidCents,
            refType: "Invoice",
            refId: invoice.id,
            description: `Package purchase — ${pkg.name}`,
            performedById: auth.userId,
          },
        });
      }
    } else if (amountPaidCents > 0) {
      await tx.financialTransaction.create({
        data: {
          clinicId: auth.clinicId,
          patientId: patient.id,
          type: "PACKAGE_PURCHASE",
          amountCents: amountPaidCents,
          refType: "PatientPackage",
          refId: pp.id,
          description: `Package purchase — ${pkg.name}`,
          performedById: auth.userId,
        },
      });
    }

    return pp;
  });

  // keep invoice paidCents/status consistent (outside tx — recalculates from committed rows)
  if (body.createInvoice && invoiceNumber) {
    const inv = await db.invoice.findFirst({ where: { invoiceNumber, clinicId: auth.clinicId } });
    if (inv) await recalcInvoiceStatus(inv.id);
  }

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PACKAGE_PURCHASED",
    entityType: "PatientPackage",
    entityId: created.id,
    newValues: {
      patientId: patient.id, packageId: pkg.id, amountPaidCents,
      createInvoice: body.createInvoice, invoiceNumber,
    },
  });

  await notify({
    clinicId: auth.clinicId,
    audienceRole: "RECEPTIONIST",
    type: "PACKAGE_PURCHASED",
    title: "Package purchased",
    message: `${patient.firstName} ${patient.lastName} purchased ${pkg.name} — ${pkg.sessions} sessions valid until ${expiryDate.toLocaleDateString("en-GB")}.`,
    entityType: "PatientPackage",
    entityId: created.id,
  });

  const patientPackage = await db.patientPackage.findUnique({
    where: { id: created.id },
    include: {
      patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true } },
      package: true,
      transactions: { orderBy: { createdAt: "desc" } },
    },
  });

  return json({ patientPackage }, 201);
});
