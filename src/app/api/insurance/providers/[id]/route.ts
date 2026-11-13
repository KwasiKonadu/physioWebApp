// ============ Insurance provider detail + update (config incl. active toggle) ============
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  db, route, json, parseBody, getQuery, ApiError, audit, requireAuth, requirePermission,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const includeRates = getQuery(req, "rates") === "true";

  const provider = await db.insuranceProvider.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      _count: { select: { rates: true, claims: true } },
      ...(includeRates
        ? { rates: { include: { service: { select: { id: true, name: true, standardPriceCents: true, category: true } } }, orderBy: { rateCents: "desc" as const } } }
        : {}),
    },
  });
  if (!provider) throw new ApiError(404, "Insurance provider not found");
  return json({ provider });
});

const updateSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric").optional(),
  contactName: z.string().max(120).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  billingArrangement: z.enum(["DIRECT_BILLING", "REIMBURSEMENT", "CAPITATION"]).optional(),
  coveragePercent: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.insuranceManage);
  const { id } = await ctx.params;
  const existing = await db.insuranceProvider.findFirst({ where: { id, clinicId: auth.clinicId } });
  if (!existing) throw new ApiError(404, "Insurance provider not found");

  const body = await parseBody(req, updateSchema);

  try {
    const provider = await db.insuranceProvider.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.code !== undefined ? { code: body.code.toUpperCase() } : {}),
        ...(body.contactName !== undefined ? { contactName: body.contactName || null } : {}),
        ...(body.contactPhone !== undefined ? { contactPhone: body.contactPhone || null } : {}),
        ...(body.email !== undefined ? { email: body.email || null } : {}),
        ...(body.billingArrangement !== undefined ? { billingArrangement: body.billingArrangement } : {}),
        ...(body.coveragePercent !== undefined ? { coveragePercent: body.coveragePercent } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      },
      include: { _count: { select: { rates: true, claims: true } } },
    });

    await audit({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userName: auth.name,
      action: "INSURANCE_PROVIDER_UPDATED",
      entityType: "InsuranceProvider",
      entityId: id,
      previousValues: { name: existing.name, coveragePercent: existing.coveragePercent, active: existing.active, billingArrangement: existing.billingArrangement },
      newValues: { name: provider.name, coveragePercent: provider.coveragePercent, active: provider.active, billingArrangement: provider.billingArrangement },
    });

    return json({ provider });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "A provider with this code already exists");
    }
    throw e;
  }
});
