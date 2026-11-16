// ============ Insurance claims: list + create from an insurance invoice (Business Rule 5) ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit,
  requirePermission, nextClaimNumber,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingView);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 200);
  const providerId = getQuery(req, "providerId");
  const status = getQuery(req, "status");

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (providerId) where.providerId = providerId;
  if (status) where.status = status;
  // stats follow the provider filter (but not the status filter) so a provider page shows its own totals
  const statsWhere: Record<string, unknown> = { clinicId: auth.clinicId };
  if (providerId) statsWhere.providerId = providerId;

  const [items, total, draft, submitted, approved, partiallyApproved, rejected, paid, claimedAgg, approvedAgg] = await Promise.all([
    db.insuranceClaim.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        provider: { select: { id: true, name: true, code: true, billingArrangement: true } },
        invoice: {
          select: {
            id: true, invoiceNumber: true, totalCents: true, paidCents: true, status: true, insuranceCoveredCents: true,
            patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true } },
          },
        },
      },
    }),
    db.insuranceClaim.count({ where }),
    db.insuranceClaim.count({ where: { ...statsWhere, status: "DRAFT" } }),
    db.insuranceClaim.count({ where: { ...statsWhere, status: "SUBMITTED" } }),
    db.insuranceClaim.count({ where: { ...statsWhere, status: "APPROVED" } }),
    db.insuranceClaim.count({ where: { ...statsWhere, status: "PARTIALLY_APPROVED" } }),
    db.insuranceClaim.count({ where: { ...statsWhere, status: "REJECTED" } }),
    db.insuranceClaim.count({ where: { ...statsWhere, status: "PAID" } }),
    db.insuranceClaim.aggregate({ where: statsWhere, _sum: { claimedCents: true } }),
    db.insuranceClaim.aggregate({ where: statsWhere, _sum: { approvedCents: true } }),
  ]);

  return json({
    items,
    total,
    page,
    pageSize,
    stats: {
      draft, submitted, approved, partiallyApproved, rejected, paid,
      open: draft + submitted + approved + partiallyApproved,
      claimedCents: claimedAgg._sum.claimedCents || 0,
      approvedCents: approvedAgg._sum.approvedCents || 0,
    },
  });
});

const createSchema = z.object({
  invoiceId: z.string().min(1),
  providerId: z.string().min(1).optional(), // optional — inferred when omitted
  notes: z.string().max(1000).optional().nullable(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingManage);
  const body = await parseBody(req, createSchema);

  const invoice = await db.invoice.findFirst({
    where: { id: body.invoiceId, clinicId: auth.clinicId },
    include: {
      items: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (invoice.arrangement !== "INSURANCE") {
    throw new ApiError(400, "Claims can only be created for INSURANCE invoices");
  }
  if (invoice.insuranceCoveredCents <= 0) {
    throw new ApiError(400, "Invoice has no insurance-covered amount");
  }
  if (["DRAFT", "CANCELLED"].includes(invoice.status)) {
    throw new ApiError(409, "Issue the invoice before creating a claim");
  }
  const existingClaim = await db.insuranceClaim.findUnique({ where: { invoiceId: invoice.id } });
  if (existingClaim) throw new ApiError(409, `Invoice already has claim ${existingClaim.claimNumber}`);

  // resolve the provider: explicit → inferred from applied item rates → patient's active policy
  let providerId = body.providerId || null;
  if (providerId) {
    const provider = await db.insuranceProvider.findFirst({ where: { id: providerId, clinicId: auth.clinicId } });
    if (!provider) throw new ApiError(404, "Insurance provider not found");
  } else {
    const rateKeys = invoice.items
      .filter((i) => i.serviceId && i.appliedRateCents !== null && i.coveragePercent !== null)
      .map((i) => ({ serviceId: i.serviceId!, rateCents: i.appliedRateCents!, coveragePercent: i.coveragePercent! }));
    if (rateKeys.length > 0) {
      const rateRows = await db.insuranceRate.findMany({
        where: { OR: rateKeys.map((k) => ({ serviceId: k.serviceId, rateCents: k.rateCents, coveragePercent: k.coveragePercent })) },
        select: { providerId: true },
      });
      const unique = [...new Set(rateRows.map((r) => r.providerId))];
      if (unique.length === 1) providerId = unique[0];
    }
  }
  if (!providerId) {
    const policy = await db.patientInsurance.findFirst({
      where: { patientId: invoice.patientId, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: { providerId: true },
    });
    if (policy) providerId = policy.providerId;
  }
  if (!providerId) {
    throw new ApiError(400, "Could not determine the insurance provider — pass providerId explicitly");
  }

  const claimNumber = await nextClaimNumber(auth.clinicId);
  const claim = await db.insuranceClaim.create({
    data: {
      clinicId: auth.clinicId,
      providerId,
      invoiceId: invoice.id,
      claimNumber,
      claimedCents: invoice.insuranceCoveredCents,
      approvedCents: 0,
      status: "DRAFT",
      notes: body.notes || null,
    },
    include: {
      provider: { select: { id: true, name: true, code: true, billingArrangement: true } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, patient: { select: { firstName: true, lastName: true, patientCode: true } } } },
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "CLAIM_CREATED",
    entityType: "InsuranceClaim",
    entityId: claim.id,
    newValues: { claimNumber, invoiceNumber: invoice.invoiceNumber, claimedCents: claim.claimedCents, providerId },
  });

  return json({ claim }, 201);
});
