// ============ Claim lifecycle: submit / approve / partial / reject / record insurance payment ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit,
  requirePermission, recalcInvoiceStatus,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const claimInclude = {
  provider: { select: { id: true, name: true, code: true, billingArrangement: true } },
  invoice: {
    select: {
      id: true, invoiceNumber: true, totalCents: true, paidCents: true, status: true, insuranceCoveredCents: true,
      patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true } },
    },
  },
};

export const GET = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingView);
  const { id } = await ctx.params;
  const claim = await db.insuranceClaim.findFirst({ where: { id, clinicId: auth.clinicId }, include: claimInclude });
  if (!claim) throw new ApiError(404, "Claim not found");
  return json({ claim });
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("submit"), notes: z.string().max(1000).optional() }),
  z.object({ action: z.literal("approve"), approvedCents: z.number().int().min(0).optional() }),
  z.object({ action: z.literal("partial"), approvedCents: z.number().int().min(1) }),
  z.object({ action: z.literal("reject"), notes: z.string().max(1000).optional() }),
  z.object({
    action: z.literal("record_payment"),
    amountCents: z.number().int().min(1, "Amount must be greater than zero"),
    reference: z.string().max(200).optional().nullable(),
  }),
]);

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const claim = await db.insuranceClaim.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { invoice: true },
  });
  if (!claim) throw new ApiError(404, "Claim not found");

  const auditClaim = (action: string, newValues: Record<string, unknown>, reason?: string) =>
    audit({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userName: auth.name,
      action,
      entityType: "InsuranceClaim",
      entityId: id,
      previousValues: { status: claim.status, approvedCents: claim.approvedCents },
      newValues,
      reason,
    });

  if (body.action === "submit") {
    if (claim.status !== "DRAFT") throw new ApiError(409, "Only DRAFT claims can be submitted");
    const updated = await db.insuranceClaim.update({
      where: { id },
      data: { status: "SUBMITTED", submittedDate: new Date(), ...(body.notes ? { notes: body.notes } : {}) },
      include: claimInclude,
    });
    await auditClaim("CLAIM_SUBMITTED", { status: "SUBMITTED" });
    return json({ claim: updated });
  }

  if (body.action === "approve" || body.action === "partial") {
    if (!["SUBMITTED"].includes(claim.status)) {
      throw new ApiError(409, "Only SUBMITTED claims can be approved (submit the claim first)");
    }
    const approvedCents = body.action === "approve" && body.approvedCents === undefined
      ? claim.claimedCents
      : (body.approvedCents as number);
    if (approvedCents > claim.claimedCents) {
      throw new ApiError(400, "Approved amount cannot exceed the claimed amount");
    }
    const status = approvedCents >= claim.claimedCents ? "APPROVED" : "PARTIALLY_APPROVED";
    const updated = await db.insuranceClaim.update({
      where: { id },
      data: { status, approvedCents, decisionDate: new Date() },
      include: claimInclude,
    });
    await auditClaim(status === "APPROVED" ? "CLAIM_APPROVED" : "CLAIM_PARTIALLY_APPROVED", { status, approvedCents });
    return json({ claim: updated });
  }

  if (body.action === "reject") {
    if (!["SUBMITTED"].includes(claim.status)) {
      throw new ApiError(409, "Only SUBMITTED claims can be rejected");
    }
    const updated = await db.insuranceClaim.update({
      where: { id },
      data: { status: "REJECTED", decisionDate: new Date(), ...(body.notes ? { notes: body.notes } : {}) },
      include: claimInclude,
    });
    await auditClaim("CLAIM_REJECTED", { status: "REJECTED" }, body.notes);
    return json({ claim: updated });
  }

  // action === "record_payment": insurer settles — Payment (INSURANCE) on the linked invoice
  const invoice = claim.invoice;
  if (["DRAFT", "CANCELLED"].includes(invoice.status)) {
    throw new ApiError(409, "The linked invoice is not payable");
  }
  const remaining = invoice.totalCents - invoice.paidCents;
  if (body.amountCents > remaining) {
    throw new ApiError(400, `Payment exceeds the outstanding balance (₵${(remaining / 100).toFixed(2)} remaining)`);
  }

  await db.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        clinicId: auth.clinicId,
        invoiceId: invoice.id,
        amountCents: body.amountCents,
        method: "INSURANCE",
        reference: body.reference || claim.claimNumber,
        paidAt: new Date(),
        receivedById: auth.userId,
      },
    });
    await tx.financialTransaction.create({
      data: {
        clinicId: auth.clinicId,
        patientId: invoice.patientId,
        type: "INSURANCE_PAYMENT",
        amountCents: body.amountCents,
        refType: "InsuranceClaim",
        refId: claim.id,
        description: `Insurance settlement for ${invoice.invoiceNumber} (${claim.claimNumber})`,
        performedById: auth.userId,
      },
    });
  });

  const updatedInvoice = await recalcInvoiceStatus(invoice.id);
  const fullyPaid = updatedInvoice.paidCents >= updatedInvoice.totalCents;
  const claimPaid = claim.status !== "PAID" && fullyPaid;

  const updated = await db.insuranceClaim.update({
    where: { id },
    data: claimPaid ? { status: "PAID" } : {},
    include: claimInclude,
  });

  await auditClaim("CLAIM_PAYMENT_RECORDED", {
    amountCents: body.amountCents,
    invoicePaidCents: updatedInvoice.paidCents,
    invoiceStatus: updatedInvoice.status,
    claimStatus: updated.status,
  });

  return json({ claim: updated, invoice: updatedInvoice });
});
