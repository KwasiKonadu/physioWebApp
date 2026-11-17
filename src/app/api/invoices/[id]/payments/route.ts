// ============ Record a payment on an invoice (Business Rule 2: partials, no overpay, recalc) ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit,
  requirePermission, recalcInvoiceStatus,
} from "@/server/api-exports";
import { patientShare } from "@/lib/invoice-share";
import { PERMS } from "@/lib/constants";
import { PAYMENT_METHOD_LIST } from "../../_lib";

const paymentSchema = z.object({
  amountCents: z.number().int().min(1, "Amount must be greater than zero"),
  method: z.enum(PAYMENT_METHOD_LIST),
  reference: z.string().max(200).optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, paymentSchema);

  const invoice = await db.invoice.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
      payments: { select: { amountCents: true, method: true } },
      refunds: { select: { amountCents: true } },
      claim: { select: { status: true } },
    },
  });
  if (!invoice) throw new ApiError(404, "Invoice not found");
  if (invoice.status === "DRAFT") throw new ApiError(409, "Issue the invoice before recording payments");
  if (invoice.status === "CANCELLED") throw new ApiError(409, "Cannot record payments on a cancelled invoice");

  const remaining = invoice.totalCents - invoice.paidCents;
  if (body.amountCents > remaining) {
    throw new ApiError(400, `Payment exceeds the outstanding balance (₵${(remaining / 100).toFixed(2)} remaining)`);
  }

  // Insurance invoices: the patient only owes their co-pay (total - insurer share); the rest is settled via the claim
  const share = patientShare({ ...invoice, claimStatus: invoice.claim?.status });
  if (share.insured && body.method !== "INSURANCE" && body.amountCents > share.remainingCents) {
    throw new ApiError(400, `Patient's share is ₵${(share.shareCents / 100).toFixed(2)} (insurance covers ₵${(invoice.insuranceCoveredCents / 100).toFixed(2)}) — ₵${(share.remainingCents / 100).toFixed(2)} remaining. The insurer's part is recorded through the claim.`);
  }

  const payment = await db.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        clinicId: auth.clinicId,
        invoiceId: id,
        amountCents: body.amountCents,
        method: body.method,
        reference: body.reference || null,
        notes: body.notes || null,
        paidAt: new Date(),
        receivedById: auth.userId,
      },
    });
    await tx.financialTransaction.create({
      data: {
        clinicId: auth.clinicId,
        patientId: invoice.patientId,
        type: "PAYMENT_RECEIVED",
        amountCents: body.amountCents,
        refType: "Invoice",
        refId: id,
        description: `Payment (${body.method}) for ${invoice.invoiceNumber}`,
        performedById: auth.userId,
      },
    });
    return p;
  });

  const updated = await recalcInvoiceStatus(id);

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "PAYMENT_RECORDED",
    entityType: "Invoice",
    entityId: id,
    newValues: { amountCents: body.amountCents, method: body.method, paidCents: updated.paidCents, status: updated.status },
  });

  const fresh = await db.invoice.findFirst({ where: { id }, include: { payments: { orderBy: { paidAt: "desc" } }, refunds: { orderBy: { refundedAt: "desc" } } } });
  return json({ payment, invoice: fresh || updated });
});
