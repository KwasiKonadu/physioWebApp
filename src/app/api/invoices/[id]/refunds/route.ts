// ============ Refund from an invoice (Business Rule 3: separate Refund records, never delete payments) ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit,
  requirePermission, recalcInvoiceStatus,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const refundSchema = z.object({
  amountCents: z.number().int().min(1, "Amount must be greater than zero"),
  reason: z.string().min(3, "A refund reason is required").max(500),
  paymentId: z.string().min(1).optional().nullable(),
});

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingRefund);
  const { id } = await ctx.params;
  const body = await parseBody(req, refundSchema);

  const invoice = await db.invoice.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } } },
  });
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (invoice.status === "DRAFT") throw new ApiError(409, "Nothing to refund on a DRAFT invoice");
  if (invoice.status === "CANCELLED") throw new ApiError(409, "Cannot refund a cancelled invoice");
  if (body.amountCents > invoice.paidCents) {
    throw new ApiError(400, `Refund exceeds the amount paid (₵${(invoice.paidCents / 100).toFixed(2)} paid)`);
  }
  if (body.paymentId) {
    const payment = await db.payment.findFirst({ where: { id: body.paymentId, invoiceId: id } });
    if (!payment) throw new ApiError(404, "Referenced payment not found on this invoice");
  }

  const refund = await db.$transaction(async (tx) => {
    const r = await tx.refund.create({
      data: {
        clinicId: auth.clinicId,
        invoiceId: id,
        paymentId: body.paymentId || null,
        amountCents: body.amountCents,
        reason: body.reason,
        refundedAt: new Date(),
        approvedById: auth.userId,
      },
    });
    await tx.financialTransaction.create({
      data: {
        clinicId: auth.clinicId,
        patientId: invoice.patientId,
        type: "REFUND_ISSUED",
        amountCents: -body.amountCents, // negative — money out
        refType: "Invoice",
        refId: id,
        description: `Refund for ${invoice.invoiceNumber}: ${body.reason}`,
        performedById: auth.userId,
      },
    });
    return r;
  });

  const updated = await recalcInvoiceStatus(id);

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "REFUND_ISSUED",
    entityType: "Invoice",
    entityId: id,
    previousValues: { paidCents: invoice.paidCents, status: invoice.status },
    newValues: { amountCents: body.amountCents, paidCents: updated.paidCents, status: updated.status },
    reason: body.reason,
  });

  const fresh = await db.invoice.findFirst({ where: { id }, include: { payments: { orderBy: { paidAt: "desc" } }, refunds: { orderBy: { refundedAt: "desc" } } } });
  return json({ refund, invoice: fresh || updated });
});
