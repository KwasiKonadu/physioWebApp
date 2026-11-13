// Collocated invoice helpers (underscore file — not a route)
import { z } from "zod";
import { db, ApiError } from "@/server/api-exports";

export const PAYMENT_METHOD_LIST = ["CASH", "MOBILE_MONEY", "CARD", "BANK_TRANSFER", "INSURANCE"] as const;

// ---- Invoice item schema (shared by create + draft update) ----
export const itemSchema = z.object({
  serviceId: z.string().min(1).optional().nullable(),
  description: z.string().min(1).max(300),
  quantity: z.number().int().min(1).max(999).default(1),
  unitPriceCents: z.number().int().min(0),
  providerId: z.string().min(1).optional().nullable(), // INSURANCE only — selects negotiated rate
});

export const itemsSchema = z.array(itemSchema).min(1, "At least one invoice item is required").max(50);

export type ItemInput = z.infer<typeof itemSchema>;

/**
 * Business Rule 1: historical invoices preserve the unit price AND applied insurance rate at
 * billing time. For INSURANCE items carrying providerId + serviceId we look up the negotiated
 * InsuranceRate and snapshot appliedRateCents / coveragePercent / coveredCents onto the item.
 */
export async function buildInvoiceItems(clinicId: string, items: ItemInput[]) {
  const providerIds = [...new Set(items.map((i) => i.providerId).filter(Boolean))] as string[];
  const serviceIds = [...new Set(items.map((i) => i.serviceId).filter(Boolean))] as string[];

  const [providerRows, serviceRows] = await Promise.all([
    providerIds.length
      ? db.insuranceProvider.findMany({ where: { id: { in: providerIds }, clinicId }, select: { id: true, name: true } })
      : Promise.resolve([]),
    serviceIds.length
      ? db.service.findMany({ where: { id: { in: serviceIds }, clinicId }, select: { id: true, name: true, standardPriceCents: true } })
      : Promise.resolve([]),
  ]);
  const providerMap = new Map<string, string>(providerRows.map((p) => [p.id, p.name] as [string, string]));
  const serviceMap = new Map<string, { name: string; standardPriceCents: number }>(
    serviceRows.map((s) => [s.id, { name: s.name, standardPriceCents: s.standardPriceCents }] as [string, { name: string; standardPriceCents: number }])
  );

  const rates = providerIds.length
    ? await db.insuranceRate.findMany({
        // InsuranceRate has no clinicId — scoped through the clinic-scoped provider/service ids
        where: { providerId: { in: providerIds }, serviceId: { in: serviceIds.length ? serviceIds : ["-"] } },
      })
    : [];
  const rateMap = new Map<string, { rateCents: number; coveragePercent: number; active: boolean }>(
    rates.map((r) => [`${r.providerId}:${r.serviceId}`, { rateCents: r.rateCents, coveragePercent: r.coveragePercent, active: r.active }] as [string, { rateCents: number; coveragePercent: number; active: boolean }])
  );

  const rows: {
    serviceId: string | null;
    description: string;
    quantity: number;
    unitPriceCents: number;
    appliedRateCents: number | null;
    coveragePercent: number | null;
    coveredCents: number;
  }[] = [];
  let subtotalCents = 0;
  let insuranceCoveredCents = 0;

  for (const item of items) {
    let unitPriceCents = item.unitPriceCents;
    let appliedRateCents: number | null = null;
    let coveragePercent: number | null = null;
    let coveredCents = 0;

    if (item.providerId && item.serviceId) {
      const providerName = providerMap.get(item.providerId);
      if (!providerName) throw new ApiError(404, "Insurance provider not found");
      const rate = rateMap.get(`${item.providerId}:${item.serviceId}`);
      if (!rate || !rate.active) {
        throw new ApiError(400, `No negotiated rate configured for service "${serviceMap.get(item.serviceId)?.name || item.serviceId}" with this provider`);
      }
      appliedRateCents = rate.rateCents;
      coveragePercent = rate.coveragePercent;
      unitPriceCents = rate.rateCents; // billed at the negotiated rate
      coveredCents = Math.round((rate.rateCents * item.quantity * rate.coveragePercent) / 100);
    } else if (item.serviceId && !item.unitPriceCents && serviceMap.has(item.serviceId)) {
      // fall back to the current standard price when omitted (0)
      unitPriceCents = serviceMap.get(item.serviceId)!.standardPriceCents;
    }

    subtotalCents += unitPriceCents * item.quantity;
    insuranceCoveredCents += coveredCents;

    rows.push({
      serviceId: item.serviceId || null,
      description: item.description,
      quantity: item.quantity,
      unitPriceCents,
      appliedRateCents,
      coveragePercent,
      coveredCents,
    });
  }

  return { rows, subtotalCents, insuranceCoveredCents };
}
