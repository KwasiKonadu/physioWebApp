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

  const where = { clinicId: auth.clinicId, therapistId: staff.id };
  const [periodSessions, activeEpisodes, upcomingAppointments, trendRows, apptMonthGroups, apptPeriodGroups] =
    await Promise.all([
      // completed sessions in the selected period — loaded ONCE; the session count, unique patients and the
      // weekday pattern are all derived from these rows (previously three separate queries)
      db.therapySession.findMany({
        where: { ...where, status: "COMPLETED", date: { gte: from, lte: to } },
        select: { date: true, patientId: true },
      }),
      db.treatmentEpisode.count({ where: { ...where, status: { in: OPEN_EPISODE_STATUSES } } }),
      db.appointment.count({
        where: { ...where, date: { gt: to }, status: { in: ["SCHEDULED", "CONFIRMED", "RESCHEDULED"] } },
      }),
      db.therapySession.findMany({
        where: { ...where, status: "COMPLETED", date: { gte: sixMonthsAgo, lte: to } },
        select: { date: true, patientId: true },
      }),
      // appointments over the last 6 months, grouped in the database (monthly booked / completed / no-show / cancelled)
      db.appointment.groupBy({
        by: ["date", "status"],
        where: { ...where, date: { gte: sixMonthsAgo, lte: to } },
        _count: { _all: true },
      }),
      // appointment status mix in the selected period (also gives completed + no-show counts)
      db.appointment.groupBy({
        by: ["status"],
        where: { ...where, date: { gte: from, lte: to } },
        _count: { _all: true },
      }),
    ]);

  const completedSessions = periodSessions.length;
  const uniquePatients = new Set(periodSessions.map((r) => r.patientId)).size;
  const periodStatus = new Map(apptPeriodGroups.map((g) => [g.status, g._count._all]));
  const appointmentsCompleted = periodStatus.get("COMPLETED") || 0;
  const noShows = periodStatus.get("NO_SHOW") || 0;

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
  for (const a of apptMonthGroups) {
    const d = new Date(a.date);
    const m = monthMap.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (!m) continue;
    const n = a._count._all;
    m.booked += n;
    if (a.status === "COMPLETED") m.completed += n;
    else if (a.status === "NO_SHOW") m.noShows += n;
    else if (a.status === "CANCELLED") m.cancelled += n;
  }

  const statusCounts = periodStatus;

  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => ({ day, sessions: 0 }));
  for (const r of periodSessions) weekdays[(new Date(r.date).getDay() + 6) % 7].sessions += 1;

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
