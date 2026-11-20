// ============ Adjust stock: IN (received) / OUT (used) / ADJUST (stocktake — sets the counted quantity) ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { serializeItem, serializeMovement } from "../../_lib";

const adjustSchema = z.object({
  type: z.enum(["IN", "OUT", "ADJUST"]),
  // IN / OUT: units moved (>= 1). ADJUST: the counted quantity (>= 0).
  amount: z.number().int().min(0).max(10_000_000),
  reason: z.string().trim().max(200).optional().nullable(),
});

const DEFAULT_REASON = { IN: "Stock in (received)", OUT: "Stock out (used / issued)", ADJUST: "Stocktake" } as const;

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.inventoryManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, adjustSchema);
  if (body.type !== "ADJUST" && body.amount < 1) throw new ApiError(400, "Quantity must be at least 1");

  const result = await db.$transaction(async (tx) => {
    const before = await tx.inventoryItem.findFirst({ where: { id, clinicId: auth.clinicId } });
    if (!before) throw new ApiError(404, "Item not found");

    let item;
    if (body.type === "OUT") {
      // guarded decrement: never lets two concurrent requests take the stock below zero
      const res = await tx.inventoryItem.updateMany({
        where: { id, clinicId: auth.clinicId, quantity: { gte: body.amount } },
        data: { quantity: { decrement: body.amount } },
      });
      if (res.count === 0) throw new ApiError(409, `Only ${before.quantity} ${before.unit} in stock`);
      item = await tx.inventoryItem.findUniqueOrThrow({ where: { id } });
    } else if (body.type === "IN") {
      item = await tx.inventoryItem.update({ where: { id }, data: { quantity: { increment: body.amount } } });
    } else {
      item = await tx.inventoryItem.update({ where: { id }, data: { quantity: body.amount } });
    }

    const movement = await tx.stockMovement.create({
      data: {
        clinicId: auth.clinicId, itemId: id, itemName: item.name, type: body.type,
        change: item.quantity - before.quantity, quantityAfter: item.quantity,
        reason: body.reason || DEFAULT_REASON[body.type],
        createdById: auth.userId, createdByName: auth.name,
      },
    });
    return { item, movement, previous: before.quantity };
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "INVENTORY_STOCK_ADJUSTED", entityType: "InventoryItem", entityId: id,
    previousValues: { quantity: result.previous }, newValues: { quantity: result.item.quantity, type: body.type },
    reason: result.movement.reason ?? undefined,
  });
  return json({ item: serializeItem(result.item), movement: serializeMovement(result.movement) });
});
