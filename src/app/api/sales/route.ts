// ============ Sales: list (with stats) + record a sale (deducts stock atomically) ============
import { z } from "zod";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit, requirePermission, nextSaleNumber,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { serializeSale, startOfToday } from "../inventory/_lib";

const METHODS = ["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER"] as const;

const saleSchema = z.object({
  // omit for a walk-in customer
  patientId: z.string().trim().min(1).optional().nullable(),
  paymentMethod: z.enum(METHODS),
  note: z.string().trim().max(500).optional().nullable(),
  lines: z.array(z.object({
    itemId: z.string().min(1),
    quantity: z.number().int().min(1).max(1_000_000),
    unitPriceCents: z.number().int().min(0),
  })).min(1, "Add at least one item").max(50),
});

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.inventoryView);
  const search = (getQuery(req, "search") || "").trim();
  const method = getQuery(req, "method");
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 10)));

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (method && (METHODS as readonly string[]).includes(method)) where.paymentMethod = method;
  if (search) {
    where.OR = [
      { saleNumber: { contains: search, mode: "insensitive" } },
      { customerName: { contains: search, mode: "insensitive" } },
      { lines: { some: { name: { contains: search, mode: "insensitive" } } } },
    ];
  }

  const live = { clinicId: auth.clinicId, voided: false };
  const [rows, total, today, overall, units] = await Promise.all([
    db.sale.findMany({ where, include: { lines: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    db.sale.count({ where }),
    db.sale.aggregate({ where: { ...live, createdAt: { gte: startOfToday() } }, _sum: { totalCents: true }, _count: true }),
    db.sale.aggregate({ where: live, _sum: { totalCents: true }, _count: true }),
    db.saleLine.aggregate({ where: { sale: live }, _sum: { quantity: true } }),
  ]);

  return json({
    items: rows.map(serializeSale),
    total, page, pageSize,
    stats: {
      todayCents: today._sum.totalCents ?? 0,
      todayCount: today._count,
      totalCents: overall._sum.totalCents ?? 0,
      transactions: overall._count,
      units: units._sum.quantity ?? 0,
    },
  });
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.inventoryManage);
  const body = await parseBody(req, saleSchema);

  const ids = body.lines.map((l) => l.itemId);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "Each item can only appear once on a sale");

  const items = await db.inventoryItem.findMany({ where: { id: { in: ids }, clinicId: auth.clinicId } });
  const byId = new Map(items.map((i) => [i.id, i]));
  for (const l of body.lines) {
    const item = byId.get(l.itemId);
    if (!item) throw new ApiError(404, "An item on this sale no longer exists");
    if (l.quantity > item.quantity) throw new ApiError(409, `Only ${item.quantity} ${item.unit} of ${item.name} in stock`);
  }

  let customerName: string | null = null;
  if (body.patientId) {
    const p = await db.patient.findFirst({ where: { id: body.patientId, clinicId: auth.clinicId }, select: { firstName: true, middleName: true, lastName: true } });
    if (!p) throw new ApiError(404, "Patient not found");
    customerName = [p.firstName, p.middleName, p.lastName].filter(Boolean).join(" ");
  }

  const saleNumber = await nextSaleNumber(auth.clinicId);
  const totalCents = body.lines.reduce((sum, l) => sum + l.quantity * l.unitPriceCents, 0);

  const sale = await db.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        clinicId: auth.clinicId, saleNumber, patientId: body.patientId || null, customerName,
        paymentMethod: body.paymentMethod, totalCents, note: body.note || null,
        soldById: auth.userId, soldByName: auth.name,
        lines: {
          create: body.lines.map((l) => {
            const item = byId.get(l.itemId)!;
            return { itemId: item.id, name: item.name, unit: item.unit, quantity: l.quantity, unitPriceCents: l.unitPriceCents };
          }),
        },
      },
      include: { lines: true },
    });

    for (const l of body.lines) {
      // guarded decrement — if someone else sold the stock since we checked, the whole sale rolls back
      const res = await tx.inventoryItem.updateMany({
        where: { id: l.itemId, clinicId: auth.clinicId, quantity: { gte: l.quantity } },
        data: { quantity: { decrement: l.quantity } },
      });
      if (res.count === 0) throw new ApiError(409, `Not enough ${byId.get(l.itemId)!.name} in stock`);
      const after = await tx.inventoryItem.findUniqueOrThrow({ where: { id: l.itemId }, select: { quantity: true, name: true } });
      await tx.stockMovement.create({
        data: {
          clinicId: auth.clinicId, itemId: l.itemId, itemName: after.name, type: "OUT",
          change: -l.quantity, quantityAfter: after.quantity, reason: `Sale ${saleNumber}`, saleId: created.id,
          createdById: auth.userId, createdByName: auth.name,
        },
      });
    }
    return created;
  });

  await audit({
    clinicId: auth.clinicId, userId: auth.userId, userName: auth.name,
    action: "SALE_RECORDED", entityType: "Sale", entityId: sale.id,
    newValues: { saleNumber, totalCents, paymentMethod: body.paymentMethod, lines: body.lines.length, patientId: body.patientId || null },
  });

  return json({ sale: serializeSale(sale) }, 201);
});
