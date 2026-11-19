// ============ API: Staff workload & remuneration stats (therapists) ============
// Business Rules 1/2: only COMPLETED therapy sessions count; PER_PATIENT counts UNIQUE patients.
import { db, route, json, getQuery, ApiError, requireAuth, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { staffIdForUser } from "@/server/leave";
import { fixedSalaryForPeriod } from "@/lib/remuneration";

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
  const { id } = await ctx.params;
  if ((await staffIdForUser(auth.userId)) !== id) requirePermission(req, PERMS.staffView);

  const staff = await db.staffProfile.findUnique({ where: { id } });
  if (!staff || staff.clinicId !== auth.clinicId) throw new ApiError(404, "Staff member not found");

  const now = new Date();
  const from = parseQueryDate(getQuery(req, "from")) || startOfMonth(now);
  const to = parseQueryDate(getQuery(req, "to"), true) || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const sixMonthsAgo = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));

  const [completedSessions, uniquePatientRows, activeEpisodes, appointmentsCompleted, noShows, upcomingAppointments, trendRows, apptMonthRows, apptPeriodRows, sessionPeriodRows] =
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
        select: { date: true, patientId: true },
      }),
      // appointments over the last 6 months (monthly booked / completed / no-show / cancelled)
      db.appointment.findMany({
        where: { clinicId: auth.clinicId, therapistId: staff.id, date: { gte: sixMonthsAgo, lte: to } },
        select: { date: true, status: true },
      }),
      // appointments in the selected period (status mix)
      db.appointment.findMany({
        where: { clinicId: auth.clinicId, therapistId: staff.id, date: { gte: from, lte: to } },
        select: { status: true },
      }),
      // completed sessions in the selected period (weekday pattern)
      db.therapySession.findMany({
        where: { clinicId: auth.clinicId, therapistId: staff.id, status: "COMPLETED", date: { gte: from, lte: to } },
        select: { date: true },
      }),
    ]);

  const uniquePatients = uniquePatientRows.length;

  // Remuneration (Business Rule 1)
  const rateCents = staff.remunerationRateCents ?? null;
  let computedCents: number | null = null;
  if (rateCents !== null && staff.remunerationMethod === "PER_SESSION") computedCents = completedSessions * rateCents;
  else if (rateCents !== null && staff.remunerationMethod === "PER_PATIENT") computedCents = uniquePatients * rateCents;
  else if (rateCents !== null && staff.remunerationMethod === "FIXED") computedCents = fixedSalaryForPeriod(rateCents, from, to);

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

  // richer monthly series: sessions, distinct patients, appointments booked / completed / no-shows / cancelled
  const monthly = buckets.map((b) => ({ key: b.key, month: b.label, sessions: b.sessions, patients: new Set<string>(), booked: 0, completed: 0, noShows: 0, cancelled: 0 }));
  const monthMap = new Map(monthly.map((m) => [m.key, m]));
  for (const row of trendRows) {
    const d = new Date(row.date);
    monthMap.get(`${d.getFullYear()}-${d.getMonth()}`)?.patients.add(row.patientId);
  }
  for (const a of apptMonthRows) {
    const d = new Date(a.date);
    const m = monthMap.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!m) continue;
    m.booked += 1;
    if (a.status === "COMPLETED") m.completed += 1;
    else if (a.status === "NO_SHOW") m.noShows += 1;
    else if (a.status === "CANCELLED") m.cancelled += 1;
  }

  const statusCounts = new Map<string, number>();
  for (const a of apptPeriodRows) statusCounts.set(a.status, (statusCounts.get(a.status) || 0) + 1);

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({ day, sessions: 0 }));
  for (const r of sessionPeriodRows) weekdays[(new Date(r.date).getDay() + 6) % 7].sessions += 1;

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
    monthly: monthly.map((m) => ({ month: m.month, sessions: m.sessions, patients: m.patients.size, booked: m.booked, completed: m.completed, noShows: m.noShows, cancelled: m.cancelled })),
    statusBreakdown: [...statusCounts.entries()].map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count),
    byWeekday: weekdays,
  });
});
