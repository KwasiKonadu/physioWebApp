// ============ Invoice detail + actions (issue / cancel / update draft) ============
import { z } from "zod";
import {
  db, route, json, parseBody, ApiError, audit, requirePermission,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { itemsSchema, buildInvoiceItems } from "../_lib";

const includeDetail = {
  items: true,
  payments: { orderBy: { paidAt: "desc" as const } },
  refunds: { orderBy: { refundedAt: "desc" as const } },
  patient: { select: { id: true, firstName: true, middleName: true, lastName: true, patientCode: true, phone: true, email: true, paymentArrangement: true } },
  episode: { select: { id: true, title: true, episodeNumber: true, status: true } },
  claim: true,
};

export const GET = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingView);
  const { id } = await ctx.params;
  const invoice = await db.invoice.findFirst({ where: { id, clinicId: auth.clinicId }, include: includeDetail });
  if (!invoice) throw new ApiError(404, "Invoice not found");
  return json({ invoice });
});

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("issue") }),
  z.object({ action: z.literal("cancel"), reason: z.string().max(500).optional() }),
  z.object({
    action: z.literal("update"),
    notes: z.string().max(2000).optional().nullable(),
    dueDate: z.string().optional().nullable(),
    items: itemsSchema.optional(), // items replaceable while DRAFT only
  }),
]);

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.billingManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const invoice = await db.invoice.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: { payments: { select: { id: true } }, refunds: { select: { id: true } }, claim: { select: { id: true } } },
  });
  if (!invoice) throw new ApiError(404, "Invoice not found");

  if (body.action === "issue") {
    if (invoice.status !== "DRAFT") throw new ApiError(409, "Only DRAFT invoices can be issued");
    const updated = await db.invoice.update({
      where: { id },
      data: { status: "UNPAID", issuedById: auth.userId, issuedAt: new Date() },
      include: includeDetail,
    });
    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "INVOICE_ISSUED", entityType: "Invoice", entityId: id,
      previousValues: { status: "DRAFT" }, newValues: { status: "UNPAID", totalCents: invoice.totalCents },
    });
    return json({ invoice: updated });
  }

  if (body.action === "cancel") {
    if (!["DRAFT", "UNPAID"].includes(invoice.status)) {
      throw new ApiError(409, "Only DRAFT or UNPAID invoices can be cancelled");
    }
    if (invoice.payments.length > 0 || invoice.refunds.length > 0) {
      throw new ApiError(409, "Invoice has payments recorded — use a refund instead");
    }
    if (invoice.claim) throw new ApiError(409, "Invoice has an insurance claim attached");
    const updated = await db.invoice.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: includeDetail,
    });
    await audit({
      clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
      action: "INVOICE_CANCELLED", entityType: "Invoice", entityId: id,
      previousValues: { status: invoice.status }, newValues: { status: "CANCELLED" },
      reason: body.reason,
    });
    return json({ invoice: updated });
  }

  // action === "update"
  if (invoice.status === "CANCELLED") throw new ApiError(409, "Cancelled invoices cannot be edited");
  if (body.items) {
    if (invoice.status !== "DRAFT") throw new ApiError(409, "Items can only be edited while the invoice is a DRAFT");
    const { rows, subtotalCents, insuranceCoveredCents } = await buildInvoiceItems(auth.clinicId, body.items);
    const discountCents = Math.min(invoice.discountCents, subtotalCents);
    const totalCents = subtotalCents - discountCents;
    await db.invoiceItem.deleteMany({ where: { invoiceId: id } });
    await db.invoiceItem.createMany({ data: rows.map((r) => ({ ...r, invoiceId: id })) });
    await db.invoice.update({
      where: { id },
      data: {
        subtotalCents,
        discountCents,
        totalCents,
        insuranceCoveredCents: invoice.arrangement === "INSURANCE" ? insuranceCoveredCents : 0,
      },
    });
  }
  const updated = await db.invoice.update({
    where: { id },
    data: {
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
      ...(body.dueDate !== undefined ? { dueDate: body.dueDate ? new Date(body.dueDate) : null } : {}),
    },
    include: includeDetail,
  });
  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "INVOICE_UPDATED", entityType: "Invoice", entityId: id,
    newValues: { notes: updated.notes, dueDate: updated.dueDate, itemsReplaced: !!body.items },
  });
  return json({ invoice: updated });
});
