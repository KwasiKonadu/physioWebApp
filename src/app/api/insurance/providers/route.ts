// ============ Insurance providers: list + create ============
import { z } from "zod";
import { Prisma } from "@prisma/client";
import {
  db, route, json, parseBody, getQuery, getQueryInt, ApiError, audit,
  requirePermission,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const providerSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, "Code must be alphanumeric"),
  contactName: z.string().max(120).optional().nullable(),
  contactPhone: z.string().max(40).optional().nullable(),
  email: z.string().max(160).optional().nullable(),
  billingArrangement: z.enum(["DIRECT_BILLING", "REIMBURSEMENT", "CAPITATION"]).default("DIRECT_BILLING"),
  coveragePercent: z.number().int().min(0).max(100).default(80),
  active: z.boolean().default(true),
});

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.billingView);
  const page = getQueryInt(req, "page", 1);
  const pageSize = Math.min(getQueryInt(req, "pageSize", 50), 200);
  const active = getQuery(req, "active");
  const search = getQuery(req, "search");

  const where: Record<string, unknown> = { clinicId: auth.clinicId };
  if (active === "true") where.active = true;
  if (active === "false") where.active = false;
  if (search) where.OR = [{ name: { contains: search, mode: "insensitive" } }, { code: { contains: search, mode: "insensitive" } }];

  const [items, total] = await Promise.all([
    db.insuranceProvider.findMany({
      where,
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { rates: true, claims: true } } },
    }),
    db.insuranceProvider.count({ where }),
  ]);

  return json({ items, total, page, pageSize });
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.insuranceManage);
  const body = await parseBody(req, providerSchema);

  try {
    const provider = await db.insuranceProvider.create({
      data: {
        clinicId: auth.clinicId,
        name: body.name,
        code: body.code.toUpperCase(),
        contactName: body.contactName || null,
        contactPhone: body.contactPhone || null,
        email: body.email || null,
        billingArrangement: body.billingArrangement,
        coveragePercent: body.coveragePercent,
        active: body.active,
      },
      include: { _count: { select: { rates: true, claims: true } } },
    });

    await audit({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userName: auth.name,
      action: "INSURANCE_PROVIDER_CREATED",
      entityType: "InsuranceProvider",
      entityId: provider.id,
      newValues: { name: body.name, code: body.code.toUpperCase(), billingArrangement: body.billingArrangement, coveragePercent: body.coveragePercent },
    });

    return json({ provider }, 201);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "A provider with this code already exists");
    }
    throw e;
  }
});
