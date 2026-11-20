// ============ Inventory item: update details + delete. Quantity only changes through /adjust (so it is logged). ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { serializeItem } from "../_lib";

const updateSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().max(60).optional().nullable(),
  category: z.string().trim().min(1).max(60).optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  reorderLevel: z.number().int().min(0).max(10_000_000).optional(),
  unitCostCents: z.number().int().min(0).optional(),
  sellPriceCents: z.number().int().min(0).optional(),
  supplier: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.inventoryManage);
  const { id } = await ctx.params;
  const existing = await db.inventoryItem.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!existing) throw new ApiError(404, "Item not found");
  const body = await parseBody(req, updateSchema);

  const item = await db.inventoryItem.update({
    where: { id },
    data: {
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.sku !== undefined ? { sku: body.sku || null } : {}),
      ...(body.category !== undefined ? { category: body.category } : {}),
      ...(body.unit !== undefined ? { unit: body.unit } : {}),
      ...(body.reorderLevel !== undefined ? { reorderLevel: body.reorderLevel } : {}),
      ...(body.unitCostCents !== undefined ? { unitCostCents: body.unitCostCents } : {}),
      ...(body.sellPriceCents !== undefined ? { sellPriceCents: body.sellPriceCents } : {}),
      ...(body.supplier !== undefined ? { supplier: body.supplier || null } : {}),
      ...(body.location !== undefined ? { location: body.location || null } : {}),
      ...(body.notes !== undefined ? { notes: body.notes || null } : {}),
    },
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "INVENTORY_ITEM_UPDATED", entityType: "InventoryItem", entityId: id,
    previousValues: { name: existing.name, sellPriceCents: existing.sellPriceCents, unitCostCents: existing.unitCostCents },
    newValues: body,
  });
  return json({ item: serializeItem(item) });
});

export const DELETE = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.inventoryManage);
  const { id } = await ctx.params;
  const existing = await db.inventoryItem.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!existing) throw new ApiError(404, "Item not found");

  // movements are removed with the item; past sale lines keep their name/price snapshot
  await db.inventoryItem.delete({ where: { id } });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "INVENTORY_ITEM_DELETED", entityType: "InventoryItem", entityId: id,
    previousValues: { name: existing.name, quantity: existing.quantity },
  });
  return json({ ok: true });
});
