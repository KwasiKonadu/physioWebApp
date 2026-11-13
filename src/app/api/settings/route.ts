// ============ API: Clinic settings (clinic info, branches, configuration keys) ============
import { z } from "zod";
import { db, route, json, parseBody, ApiError, audit, requireAuth, requirePermission, getSetting, setSetting } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const SETTING_DEFAULTS = {
  reviewThreshold: "15",
  appointmentSlotMin: "30",
  workingHoursStart: "07:00",
  workingHoursEnd: "19:00",
  currency: "GHS",
  timezone: "Africa/Accra",
} as const;

const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof typeof SETTING_DEFAULTS)[];

async function loadSettings(clinicId: string): Promise<{
  reviewThreshold: number;
  appointmentSlotMin: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  currency: string;
  timezone: string;
}> {
  const entries = await Promise.all(
    SETTING_KEYS.map(async (key) => ({ key, value: await getSetting(clinicId, key, SETTING_DEFAULTS[key]) }))
  );
  const raw = Object.fromEntries(entries.map((e) => [e.key, e.value]));
  return {
    reviewThreshold: parseInt(raw.reviewThreshold, 10) || 15,
    appointmentSlotMin: parseInt(raw.appointmentSlotMin, 10) || 30,
    workingHoursStart: raw.workingHoursStart,
    workingHoursEnd: raw.workingHoursEnd,
    currency: raw.currency,
    timezone: raw.timezone,
  };
}

export const GET = route(async (req) => {
  const auth = requireAuth(req);

  const [clinic, branches, settings] = await Promise.all([
    db.clinic.findUnique({
      where: { id: auth.clinicId },
      select: { id: true, name: true, code: true, address: true, phone: true, email: true, timezone: true, currency: true },
    }),
    db.branch.findMany({ where: { clinicId: auth.clinicId }, orderBy: { name: "asc" } }),
    loadSettings(auth.clinicId),
  ]);
  if (!clinic || clinic.id !== auth.clinicId) throw new ApiError(404, "Clinic not found");

  return json({ clinic, branches, settings });
});

const patchSchema = z.object({
  clinic: z
    .object({
      name: z.string().min(1, "Clinic name is required").optional(),
      address: z.string().optional().nullable(),
      phone: z.string().optional().nullable(),
      email: z.string().email().or(z.literal("")).optional().nullable(),
    })
    .optional(),
  settings: z
    .object({
      reviewThreshold: z.coerce.number().int("Review threshold must be a whole number").min(1).max(100).optional(),
      appointmentSlotMin: z.coerce.number().int("Slot minutes must be a whole number").min(5).max(240).optional(),
      workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional(),
      workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM format").optional(),
      currency: z.string().min(1).max(8).optional(),
      timezone: z.string().min(1).optional(),
    })
    .optional(),
});

export const PATCH = route(async (req) => {
  const auth = requirePermission(req, PERMS.settingsManage);
  const body = await parseBody(req, patchSchema);

  if (!body.clinic && !body.settings) throw new ApiError(400, "Nothing to update");

  const clinic = await db.clinic.findUnique({ where: { id: auth.clinicId } });
  if (!clinic) throw new ApiError(404, "Clinic not found");

  const previousSettings = await loadSettings(auth.clinicId);
  const previousClinic = { name: clinic.name, address: clinic.address, phone: clinic.phone, email: clinic.email };

  const newSettings: Record<string, string> = {};
  if (body.settings) {
    for (const [key, value] of Object.entries(body.settings)) {
      if (value === undefined || value === null) continue;
      await setSetting(auth.clinicId, key, String(value));
      newSettings[key] = String(value);
    }
  }

  let clinicUpdated = false;
  if (body.clinic) {
    const data: Record<string, unknown> = {};
    if (body.clinic.name !== undefined && body.clinic.name !== clinic.name) data.name = body.clinic.name.trim();
    if (body.clinic.address !== undefined) data.address = body.clinic.address || null;
    if (body.clinic.phone !== undefined) data.phone = body.clinic.phone || null;
    if (body.clinic.email !== undefined) data.email = body.clinic.email ? body.clinic.email.toLowerCase().trim() : null;
    if (Object.keys(data).length > 0) {
      await db.clinic.update({ where: { id: auth.clinicId }, data: data as never });
      clinicUpdated = true;
    }
  }

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "SETTING_UPDATED",
    entityType: "Clinic",
    entityId: auth.clinicId,
    previousValues: {
      ...(clinicUpdated ? { clinic: previousClinic } : {}),
      ...(newSettings.reviewThreshold !== undefined ? { reviewThreshold: previousSettings.reviewThreshold } : {}),
      ...(newSettings.appointmentSlotMin !== undefined ? { appointmentSlotMin: previousSettings.appointmentSlotMin } : {}),
      ...(newSettings.workingHoursStart !== undefined ? { workingHoursStart: previousSettings.workingHoursStart } : {}),
      ...(newSettings.workingHoursEnd !== undefined ? { workingHoursEnd: previousSettings.workingHoursEnd } : {}),
      ...(newSettings.currency !== undefined ? { currency: previousSettings.currency } : {}),
      ...(newSettings.timezone !== undefined ? { timezone: previousSettings.timezone } : {}),
    },
    newValues: {
      ...(clinicUpdated && body.clinic ? { clinic: body.clinic } : {}),
      ...newSettings,
    },
  });

  const [freshClinic, freshSettings] = await Promise.all([
    db.clinic.findUnique({
      where: { id: auth.clinicId },
      select: { id: true, name: true, code: true, address: true, phone: true, email: true, timezone: true, currency: true },
    }),
    loadSettings(auth.clinicId),
  ]);

  return json({ clinic: freshClinic, settings: freshSettings });
});
