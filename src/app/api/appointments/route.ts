// ============ Appointments API: calendar/list queries + booking creation ============
import {
  db, route, json, getQuery, getQueryInt, parseBody, ApiError,
  audit, notify, requireAuth, requirePermission, findTherapistConflict,
} from "@/server/api-exports";
import { PERMS, APPOINTMENT_STATUSES } from "@/lib/constants";
import { minutesToTime } from "@/lib/format";
import { z } from "zod";

// ---- helpers ----
function parseDateParam(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfLocalDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday-based start of the week containing `anchor`. */
function startOfWeek(anchor: Date): Date {
  const d = startOfLocalDay(anchor);
  const day = d.getDay(); // 0 Sun .. 6 Sat
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Computes the [start, end) range for day | week | month anchored on `anchor`. */
function computeRange(view: string, anchor: Date): { start: Date; end: Date } {
  if (view === "week") {
    const start = startOfWeek(anchor);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }
  if (view === "month") {
    const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1);
    return { start, end };
  }
  // day (default)
  const start = startOfLocalDay(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

const appointmentInclude = {
  patient: { select: { id: true, patientCode: true, firstName: true, lastName: true, phone: true } },
  therapist: { select: { id: true, firstName: true, lastName: true, jobTitle: true } },
  episode: { select: { id: true, title: true, status: true } },
  sessions: { select: { id: true, status: true, date: true, timeMin: true } },
} as const;

// ============ GET /api/appointments ============
// Calendar mode: ?view=day|week|month&date=YYYY-MM-DD[&therapistId&branchId&status&patientId]
// List mode: add &page=&pageSize= for a paged table (filters still apply)
export const GET = route(async (req) => {
  const auth = requireAuth(req);

  const view = (getQuery(req, "view") || "day").toLowerCase();
  if (!["day", "week", "month"].includes(view)) throw new ApiError(400, "view must be day, week or month");

  const anchor = parseDateParam(getQuery(req, "date")) || new Date();
  const { start, end } = computeRange(view, anchor);

  const therapistId = getQuery(req, "therapistId") || undefined;
  const branchId = getQuery(req, "branchId") || undefined;
  const status = getQuery(req, "status") || undefined;
  const patientId = getQuery(req, "patientId") || undefined;

  const where = {
    clinicId: auth.clinicId,
    date: { gte: start, lt: end },
    ...(therapistId ? { therapistId } : {}),
    ...(branchId ? { branchId } : {}),
    ...(status ? { status } : {}),
    ...(patientId ? { patientId } : {}),
  };

  const pageParam = getQuery(req, "page");
  const isListMode = pageParam !== null;
  const page = Math.max(1, getQueryInt(req, "page", 1));
  const pageSize = Math.min(100, Math.max(1, getQueryInt(req, "pageSize", 20)));

  if (isListMode) {
    const [items, total] = await Promise.all([
      db.appointment.findMany({
        relationLoadStrategy: "join",
        where,
        orderBy: [{ date: "asc" }, { startMin: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: appointmentInclude,
      }),
      db.appointment.count({ where }),
    ]);
    return json({
      items,
      total,
      page,
      pageSize,
      meta: { view, rangeStart: start.toISOString(), rangeEnd: end.toISOString() },
    });
  }

  // calendar mode — return everything in range (capped)
  const items = await db.appointment.findMany({
    relationLoadStrategy: "join",
    where,
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
    take: 500,
    include: appointmentInclude,
  });

  return json({
    items,
    total: items.length,
    page: 1,
    pageSize: 500,
    meta: { view, rangeStart: start.toISOString(), rangeEnd: end.toISOString() },
  });
});

// ============ POST /api/appointments — create booking ============
const createSchema = z.object({
  patientId: z.string().min(1, "patientId is required"),
  episodeId: z.string().nullish(),
  therapistId: z.string().min(1, "therapistId is required"),
  date: z.string().min(1, "date is required"),
  startMin: z.number().int().min(0).max(1439),
  endMin: z.number().int().min(1).max(1440),
  purpose: z.string().max(120).nullish(),
  notes: z.string().max(4000).nullish(),
  walkIn: z.boolean().nullish(),
  branchId: z.string().min(1).nullish(),
  status: z.string().nullish(),
});

export const POST = route(async (req) => {
  const auth = requirePermission(req, PERMS.appointmentsManage);
  const body = await parseBody(req, createSchema);

  if (body.status && !(APPOINTMENT_STATUSES as readonly string[]).includes(body.status)) {
    throw new ApiError(400, `Invalid status — must be one of: ${APPOINTMENT_STATUSES.join(", ")}`);
  }
  if (body.endMin <= body.startMin) throw new ApiError(400, "End time must be after start time");

  const date = parseDateParam(body.date);
  if (!date) throw new ApiError(400, "Invalid date — use YYYY-MM-DD");

  const [patient, therapist] = await Promise.all([
    db.patient.findFirst({ where: { id: body.patientId, clinicId: auth.clinicId } }),
    db.staffProfile.findFirst({ where: { id: body.therapistId, clinicId: auth.clinicId } }),
  ]);
  if (!patient) throw new ApiError(404, "Patient not found");
  if (!therapist) throw new ApiError(404, "Therapist not found");
  if (!therapist.isTherapist) throw new ApiError(400, "Selected staff member is not a physiotherapist");

  if (body.episodeId) {
    const episode = await db.treatmentEpisode.findFirst({ where: { id: body.episodeId, clinicId: auth.clinicId } });
    if (!episode) throw new ApiError(404, "Treatment episode not found");
    if (episode.patientId !== body.patientId) throw new ApiError(400, "Episode does not belong to the selected patient");
  }

  // Business rule: no double-booking — therapist overlap detection
  const conflicts = await findTherapistConflict({
    therapistId: body.therapistId,
    date,
    startMin: body.startMin,
    endMin: body.endMin,
  });
  if (conflicts.length > 0) {
    const c = conflicts[0];
    const cPatient = `${c.patient.firstName} ${c.patient.lastName}`;
    throw new ApiError(
      409,
      `Therapist already has an appointment from ${minutesToTime(c.startMin)} to ${minutesToTime(c.endMin)} (patient ${cPatient}) — pick another time`,
      "CONFLICT",
    );
  }

  const created = await db.appointment.create({
    data: {
      clinicId: auth.clinicId,
      patientId: body.patientId,
      episodeId: body.episodeId || null,
      therapistId: body.therapistId,
      date,
      startMin: body.startMin,
      endMin: body.endMin,
      purpose: body.purpose || null,
      notes: body.notes || null,
      status: body.status || "SCHEDULED",
      walkIn: body.walkIn || false,
      branchId: body.branchId || null,
      createdById: auth.userId,
    },
    include: appointmentInclude,
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "APPOINTMENT_CREATED",
    entityType: "Appointment",
    entityId: created.id,
    newValues: {
      patientId: body.patientId,
      therapistId: body.therapistId,
      date: date.toISOString(),
      startMin: body.startMin,
      endMin: body.endMin,
      walkIn: created.walkIn,
      status: created.status,
    },
  });

  const patientName = `${patient.firstName} ${patient.lastName}`;
  await notify({
    clinicId: auth.clinicId,
    audienceRole: "PHYSIOTHERAPIST",
    type: "APPOINTMENT_CREATED",
    title: created.walkIn ? "Walk-in appointment booked" : "New appointment booked",
    message: `${patientName} — ${minutesToTime(body.startMin)}–${minutesToTime(body.endMin)} with ${therapist.firstName} ${therapist.lastName}${created.purpose ? ` (${created.purpose})` : ""}.`,
    entityType: "Appointment",
    entityId: created.id,
  });

  return json({ appointment: created }, 201);
});
