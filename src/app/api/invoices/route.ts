// ============ Invoices: list + stats + create (PAYG / PACKAGE / INSURANCE) ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit,
  requirePermission, nextInvoiceNumber,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { itemsSchema, buildInvoiceItems } from "./_lib";

// ---- GET: paged list + overview stats ----
export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingView);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 20), 200);
  const patientId = getQuery(req, "patientId");
  const episodeId = getQuery(req, "episodeId");
  const status = getQuery(req, "status");
  const arrangement = getQuery(req, "arrangement");
  const from = getQuery(req, "from");
  const to = getQuery(req, "to");
  const search = getQuery(req, "search");

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (patientId) where.patientId = patientId;
  if (episodeId) where.episodeId = episodeId;
  if (status) where.status = status;
  if (arrangement) where.arrangement = arrangement;
  if (from || to) {
    const issuedAt: Record<string, Date> = {};
    if (from) issuedAt.gte = new Date(`${from}T00:00:00`);
    if (to) issuedAt.lte = new Date(`${to}T23:59:59.999`);
    where.issuedAt = issuedAt;
  }
  if (search) {
    where.AND = search.trim().split(/\s+/).filter(Boolean).map((t) => ({
      OR: [
        { invoiceNumber: { contains: t, mode: "insensitive" } },
        { patient: { OR: [{ firstName: { contains: t, mode: "insensitive" } }, { middleName: { contains: t, mode: "insensitive" } }, { lastName: { contains: t, mode: "insensitive" } }, { patientCode: { contains: t, mode: "insensitive" } }, { phone: { contains: t, mode: "insensitive" } }] } },
      ],
    }));
  }

  // ?stats=false → list only (paging/filtering); ?stats=only → stats only (overview cards, no item list)
  const statsMode = getQuery(req, "stats");
  const withItems = statsMode !== "only";
  const withStats = statsMode !== "false";

  const [items, total, stats] = await Promise.all([
    withItems
      ? db.invoice.findMany({
          where,
          orderBy: { issuedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: {
            patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true } },
            episode: { select: { id: true, title: true, episodeNumber: true } },
            _count: { select: { items: true } },
            claim: { select: { id: true, claimNumber: true, status: true } },
            payments: { select: { amountCents: true, method: true } },
            refunds: { select: { amountCents: true } },
          },
        })
      : Promise.resolve([]),
    db.invoice.count({ where }),
    withStats ? computeInvoiceStats(auth.clinicId) : Promise.resolve(null),
  ]);

  return json({ items, total, page, pageSize, ...(stats ? { stats: { count: total, ...stats } } : {}) });
});

// Clinic-wide invoice stats (independent of the list filters/page): outstanding, this month's payments by
// arrangement, and the latest payments/refunds. Outstanding uses a database aggregate, not row loading.
async function computeInvoiceStats(clinicId: string) {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [outstandingAgg, monthPayments, recentPayments, recentRefunds] = await Promise.all([
    db.invoice.aggregate({
      where: { clinicId, status: { in: ["UNPAID", "PARTIAL"] } },
      _count: { _all: true },
      _sum: { totalCents: true, paidCents: true },
    }),
    // arrangement comes with the payment (join) — no second lookup by invoice id
    db.payment.findMany({
      where: { clinicId, paidAt: { gte: monthStart } },
      select: { amountCents: true, invoice: { select: { arrangement: true } } },
    }),
    db.payment.findMany({
      where: { clinicId },
      orderBy: { paidAt: "desc" },
      take: 6,
      include: {
        invoice: {
          select: { invoiceNumber: true, patient: { select: { firstName: true, lastName: true, patientCode: true } } },
        },
      },
    }),
    db.refund.findMany({
      where: { clinicId },
      orderBy: { refundedAt: "desc" },
      take: 5,
      include: {
        invoice: {
          select: { invoiceNumber: true, patient: { select: { firstName: true, lastName: true, patientCode: true } } },
        },
      },
    }),
  ]);

  const byArrangement: Record<string, number> = { PAYG: 0, PACKAGE: 0, INSURANCE: 0 };
  let paidThisMonthCents = 0;
  for (const p of monthPayments) {
    const arr = p.invoice.arrangement || "PAYG";
    byArrangement[arr] = (byArrangement[arr] || 0) + p.amountCents;
    paidThisMonthCents += p.amountCents;
  }

  return {
    outstandingCount: outstandingAgg._count._all,
    outstandingCents: (outstandingAgg._sum.totalCents ?? 0) - (outstandingAgg._sum.paidCents ?? 0),
    paidThisMonthCents,
    byArrangement,
    recentPayments: recentPayments.map((p) => ({
      id: p.id,
      invoiceId: p.invoiceId,
      invoiceNumber: p.invoice.invoiceNumber,
      patient: `${p.invoice.patient.firstName} ${p.invoice.patient.lastName}`,
      patientCode: p.invoice.patient.patientCode,
      amountCents: p.amountCents,
      method: p.method,
      paidAt: p.paidAt,
    })),
    recentRefunds: recentRefunds.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoice.invoiceNumber,
      patient: `${r.invoice.patient.firstName} ${r.invoice.patient.lastName}`,
      patientCode: r.invoice.patient.patientCode,
      amountCents: r.amountCents,
      reason: r.reason,
      refundedAt: r.refundedAt,
    })),
  };
}

// ---- POST: create invoice (DRAFT or issue immediately) ----
const createSchema = z.object({
  patientId: z.string().min(1),
  episodeId: z.string().min(1).optional().nullable(),
  arrangement: z.enum(["PAYG", "PACKAGE", "INSURANCE"]),
  items: itemsSchema,
  discountCents: z.number().int().min(0).default(0),
  notes: z.string().max(2000).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  issue: z.boolean().default(true),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingManage);
  const body = await parseBody(req, createSchema);

  const patient = await db.patient.findFirst({ where: { id: body.patientId, clinicId: auth.clinicId } });
  if (!patient) throw new ApiError(404, "Patient not found");

  if (body.episodeId) {
    const episode = await db.treatmentEpisode.findFirst({ where: { id: body.episodeId, patientId: patient.id } });
    if (!episode) throw new ApiError(404, "Episode not found for this patient");
  }

  const { rows, subtotalCents, insuranceCoveredCents } = await buildInvoiceItems(auth.clinicId, body.items);
  const discountCents = Math.min(body.discountCents, subtotalCents);
  const totalCents = subtotalCents - discountCents;
  const invoiceNumber = await nextInvoiceNumber(auth.clinicId);
  const now = new Date();

  const invoice = await db.invoice.create({
    data: {
      clinicId: auth.clinicId,
      invoiceNumber,
      patientId: patient.id,
      episodeId: body.episodeId || null,
      arrangement: body.arrangement,
      status: body.issue ? "UNPAID" : "DRAFT",
      subtotalCents,
      discountCents,
      totalCents,
      paidCents: 0,
      insuranceCoveredCents: body.arrangement === "INSURANCE" ? insuranceCoveredCents : 0,
      notes: body.notes || null,
      issuedById: body.issue ? auth.userId : null,
      issuedAt: now,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      items: { create: rows },
    },
    include: {
      items: true,
      patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: body.issue ? "INVOICE_ISSUED" : "INVOICE_CREATED",
    entityType: "Invoice",
    entityId: invoice.id,
    newValues: {
      invoiceNumber, patientId: patient.id, arrangement: body.arrangement,
      totalCents, insuranceCoveredCents: invoice.insuranceCoveredCents, status: invoice.status,
    },
  });

  return json({ invoice }, 201);
});
