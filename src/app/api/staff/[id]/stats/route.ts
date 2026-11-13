// ============ API: Staff workload & remuneration stats (therapists) ============
// Business Rules 1/2: only COMPLETED therapy sessions count; PER_PATIENT counts UNIQUE patients.
import { db, route, json, getQuery, ApiError, requireAuth, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

const OPEN_EPISODE_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"];

function startOfMonth(d: Date): Date {
  const x = new Date(d);
  x.setDate(1);
  x.setHours(0, 0, 0, 0);
  return x;
}

function parseQueryDate(v: string | null, endOfDay = false): Date | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  if (endOfDay) d.setHours(23, 59, 59, 999);
  else d.setHours(0, 0, 0, 0);
  return d;
}

export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  requirePermission(req, PERMS.staffView);
  const { id } = await ctx.params;

  const staff = await db.staffProfile.findUnique({ where: { id } });
  if (!staff || staff.clinicId !== auth.clinicId) throw new ApiError(404, "Staff member not found");

  const now = new Date();
  const from = parseQueryDate(getQuery(req, "from")) || startOfMonth(now);
  const to = parseQueryDate(getQuery(req, "to"), true) || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const sixMonthsAgo = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));

  const [completedSessions, uniquePatientRows, activeEpisodes, appointmentsCompleted, noShows, upcomingAppointments, trendRows] =
    await Promise.all([
      db.therapySession.count({
        where: { clinicId: auth.clinicId, therapistId: staff.id, status: "COMPLETED", date: { gte: from, lte: to } },
      }),
      db.therapySession.findMany({
        where: { clinicId: auth.clinicId, therapistId: staff.id, status: "COMPLETED", date: { gte: from, lte: to } },
        distinct: ["patientId"],
        select: { patientId: true },
      }),
      db.treatmentEpisode.count({
        where: { clinicId: auth.clinicId, therapistId: staff.id, status: { in: OPEN_EPISODE_STATUSES } },
      }),
      db.appointment.count({
        where: { clinicId: auth.clinicId, therapistId: staff.id, status: "COMPLETED", date: { gte: from, lte: to } },
      }),
      db.appointment.count({
        where: { clinicId: auth.clinicId, therapistId: staff.id, status: "NO_SHOW", date: { gte: from, lte: to } },
      }),
      db.appointment.count({
        where: {
          clinicId: auth.clinicId,
          therapistId: staff.id,
          date: { gt: to },
          status: { in: ["SCHEDULED", "CONFIRMED", "RESCHEDULED"] },
        },
      }),
      db.therapySession.findMany({
        where: {
          clinicId: auth.clinicId,
          therapistId: staff.id,
          status: "COMPLETED",
          date: { gte: sixMonthsAgo, lte: to },
        },
        select: { date: true },
      }),
    ]);

  const uniquePatients = uniquePatientRows.length;

  // Remuneration (Business Rule 1)
  const rateCents = staff.remunerationRateCents ?? null;
  let computedCents: number | null = null;
  if (rateCents !== null && staff.remunerationMethod === "PER_SESSION") computedCents = completedSessions * rateCents;
  else if (rateCents !== null && staff.remunerationMethod === "PER_PATIENT") computedCents = uniquePatients * rateCents;

  // 6-month completed-sessions trend
  const buckets: { key: string; label: string; sessions: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    buckets.push({
      key: `${d.getFullYear()}-${d.getMonth()}`,
      label: d.toLocaleDateString("en-GB", { month: "short" }),
      sessions: 0,
    });
  }
  const bucketMap = new Map(buckets.map((b) => [b.key, b]));
  for (const row of trendRows) {
    const d = new Date(row.date);
    const b = bucketMap.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.sessions += 1;
  }

  return json({
    from: from.toISOString(),
    to: to.toISOString(),
    staff: { id: staff.id, name: `${staff.firstName} ${staff.lastName}`, isTherapist: staff.isTherapist },
    stats: {
      completedSessions,
      uniquePatients,
      activeEpisodes,
      appointmentsCompleted,
      noShows,
      upcomingAppointments,
    },
    remuneration: {
      method: staff.remunerationMethod,
      rateCents,
      computedCents,
    },
    trend: buckets.map((b) => ({ month: b.label, sessions: b.sessions })),
  });
});
