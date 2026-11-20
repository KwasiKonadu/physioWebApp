// ============ Inventory: stock list (with stats) + create item ============
import { z } from "zod";
import { db, route, json, parseBody, getQuery, getQueryInt, audit, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { serializeItem, stockStatus } from "./_lib";

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  sku: z.string().trim().max(60).optional().nullable(),
  category: z.string().trim().min(1).max(60).default("Other"),
  unit: z.string().trim().min(1).max(20).default("pcs"),
  quantity: z.number().int().min(0).max(10_000_000).default(0),
  reorderLevel: z.number().int().min(0).max(10_000_000).default(5),
  unitCostCents: z.number().int().min(0).default(0),
  sellPriceCents: z.number().int().min(0).default(0),
  supplier: z.string().trim().max(120).optional().nullable(),
  location: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.inventoryView);
  const search = (getQuery(req, "search") || "").trim().toLowerCase();
  const category = getQuery(req, "category");
  const status = getQuery(req, "status");
  const sellable = getQuery(req, "sellable") === "true";
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(200, Math.max(1, getQueryInt(req, "pageSize", 10)));

  // "low stock" compares two columns of the same row, which a Prisma filter can't express,
  // and a clinic's catalogue is small — so load it once, then filter / page in memory.
  const all = await db.inventoryItem.findMany({ where: { clinicId: auth.clinicId }, orderBy: { name: "asc" } });

  const stats = {
    total: all.length,
    low: all.filter((i) => stockStatus(i) === "LOW").length,
    out: all.filter((i) => stockStatus(i) === "OUT").length,
    valueCents: all.reduce((sum, i) => sum + i.quantity * i.unitCostCents, 0),
  };

  const filtered = all.filter((i) =>
    (!category || i.category === category) &&
    (!status || stockStatus(i) === status) &&
    (!sellable || i.quantity > 0) &&
    (!search || [i.name, i.sku, i.supplier, i.location].some((v) => (v || "").toLowerCase().includes(search))),
  );

  return json({
    items: filtered.slice((page - 1) * pageSize, page * pageSize).map(serializeItem),
    total: filtered.length,
    page,
    pageSize,
    stats,
  });
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.inventoryManage);
  const body = await parseBody(req, itemSchema);

  const item = await db.$transaction(async (tx) => {
    const created = await tx.inventoryItem.create({
      data: {
        clinicId: auth.clinicId,
        name: body.name,
        sku: body.sku || null,
        category: body.category,
        unit: body.unit,
        quantity: body.quantity,
        reorderLevel: body.reorderLevel,
        unitCostCents: body.unitCostCents,
        sellPriceCents: body.sellPriceCents,
        supplier: body.supplier || null,
        location: body.location || null,
        notes: body.notes || null,
      },
    });
    if (created.quantity > 0) {
      await tx.stockMovement.create({
        data: {
          clinicId: auth.clinicId, itemId: created.id, itemName: created.name, type: "IN",
          change: created.quantity, quantityAfter: created.quantity, reason: "Opening stock",
          createdById: auth.userId, createdByName: auth.name,
        },
      });
    }
    return created;
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "INVENTORY_ITEM_CREATED", entityType: "InventoryItem", entityId: item.id,
    newValues: { name: item.name, quantity: item.quantity, category: item.category },
  });

  return json({ item: serializeItem(item) }, 201);
});
