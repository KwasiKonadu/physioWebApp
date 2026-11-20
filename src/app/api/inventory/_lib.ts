// Collocated helpers for the inventory + sales routes (underscore file — not a route).
import type { InventoryItem, Sale, SaleLine, StockMovement } from "@prisma/client";

export type StockStatus = "OUT" | "LOW" | "OK";

export function stockStatus(i: Pick<InventoryItem, "quantity" | "reorderLevel">): StockStatus {
  return i.quantity <= 0 ? "OUT" : i.quantity <= i.reorderLevel ? "LOW" : "OK";
}

export function serializeItem(i: InventoryItem) {
  return { ...i, sku: i.sku ?? "", supplier: i.supplier ?? "", location: i.location ?? "", notes: i.notes ?? "", status: stockStatus(i) };
}

export function serializeMovement(m: StockMovement) {
  return { ...m, reason: m.reason ?? "" };
}

export function serializeSale(s: Sale & { lines: SaleLine[] }) {
  return {
    id: s.id,
    number: s.saleNumber,
    patientId: s.patientId,
    customer: s.customerName ?? "",
    paymentMethod: s.paymentMethod,
    totalCents: s.totalCents,
    note: s.note ?? "",
    voided: s.voided,
    soldByName: s.soldByName,
    createdAt: s.createdAt,
    lines: s.lines.map((l) => ({ id: l.id, itemId: l.itemId, name: l.name, unit: l.unit, quantity: l.quantity, unitPriceCents: l.unitPriceCents })),
  };
}

/** Start of "today" in the clinic's timezone (Africa/Accra is UTC+0 all year). */
export function startOfToday(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}
