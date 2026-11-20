// ============ Void a sale: marks it voided and returns its items to stock ============
import { db, route, json, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { serializeSale } from "../../../inventory/_lib";

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.inventoryManage);
  const { id } = await ctx.params;

  const sale = await db.$transaction(async (tx) => {
    // flip the flag first, conditionally, so two concurrent voids can't both restock
    const res = await tx.sale.updateMany({
      where: { id, clinicId: auth.clinicId, voided: false },
      data: { voided: true, voidedAt: new Date(), voidedById: auth.userId },
    });
    const current = await tx.sale.findFirst({ where: { id, clinicId: auth.clinicId }, include: { lines: true } });
    if (!current) throw new ApiError(404, "Sale not found");
    if (res.count === 0) throw new ApiError(409, "This sale has already been voided");

    for (const l of current.lines) {
      if (!l.itemId) continue; // item was deleted from the catalogue — nothing to restock
      const item = await tx.inventoryItem.update({ where: { id: l.itemId }, data: { quantity: { increment: l.quantity } } });
      await tx.stockMovement.create({
        data: {
          clinicId: auth.clinicId, itemId: item.id, itemName: item.name, type: "IN",
          change: l.quantity, quantityAfter: item.quantity, reason: `Void sale ${current.saleNumber}`, saleId: current.id,
          createdById: auth.userId, createdByName: auth.name,
        },
      });
    }
    return current;
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "SALE_VOIDED", entityType: "Sale", entityId: id,
    previousValues: { saleNumber: sale.saleNumber, totalCents: sale.totalCents },
  });
  return json({ sale: serializeSale({ ...sale, voided: true }) });
});
