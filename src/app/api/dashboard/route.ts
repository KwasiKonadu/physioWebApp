import { requireAuth } from "@/server/api-exports";
import { route, json, getQuery } from "@/server/api-exports";
import { db } from "@/server/api-exports";

function rangeToDates(range: string, from?: string | null, to?: string | null): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  if (range === "today") return { start, end };
  if (range === "week") {
    const s = new Date(start); s.setDate(s.getDate() - 6);
    return { start: s, end };
  }
  if (range === "month") {
    const s = new Date(start); s.setDate(s.getDate() - 29);
    return { start: s, end };
  }
  if (range === "custom" && from && to) {
    const s = new Date(from); s.setHours(0, 0, 0, 0);
    const e = new Date(to); e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  }
  return { start, end };
}

export const GET = route(async (req) => {
  const auth = requireAuth(req);
  const range = getQuery(req, "range") || "today";
  const from = getQuery(req, "from");
  const to = getQuery(req, "to");
  const { start, end } = rangeToDates(range, from, to);

  // chart window: last 7 days for "today"/"week", otherwise the selected range (max 60 days)
  const MS_DAY = 86_400_000;
  let chartStart = new Date(end); chartStart.setHours(0, 0, 0, 0);
  if (range === "today" || range === "week") chartStart.setDate(chartStart.getDate() - 6);
  else chartStart = new Date(start);
  if (end.getTime() - chartStart.getTime() > 59 * MS_DAY) chartStart = new Date(end.getTime() - 59 * MS_DAY);
  chartStart.setHours(0, 0, 0, 0);
  const chartEnd = end;

  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

  // payments window = union of the selected period and the chart window
  const payFrom = new Date(Math.min(start.getTime(), chartStart.getTime()));
  const payTo = new Date(Math.max(end.getTime(), chartEnd.getTime()));

  const [
    totalPatients, newPatients, activeEpisodes, todaysAppointmentsCount,
    completedSessions, reviewsDueCount, reviewsDueEpisodes, outstandingAgg, periodPayments,
    todaysAppointments, upcoming, activeEpisodeList, recentlyDischarged,
    recentPayments, recentRegistrations, recentSessions, recentAudit,
    chartAppointments, chartSessions, chartPatients,
  ] = await Promise.all([
    db.patient.count({ where: { clinicId: auth.clinicId } }),
    db.patient.count({ where: { clinicId: auth.clinicId, createdAt: { gte: start, lte: end } } }),
    db.treatmentEpisode.count({ where: { clinicId: auth.clinicId, status: { in: ["ACTIVE_TREATMENT", "AWAITING_PLAN", "UNDER_REVIEW", "ASSESSMENT_IN_PROGRESS"] } } }),
    db.appointment.count({ where: { clinicId: auth.clinicId, date: { gte: day0, lte: dayEnd }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } }),
    db.therapySession.count({ where: { clinicId: auth.clinicId, status: "COMPLETED", date: { gte: start, lte: end } } }),
    db.treatmentEpisode.count({ where: { clinicId: auth.clinicId, reviewDue: true } }),
    db.treatmentEpisode.findMany({
      where: { clinicId: auth.clinicId, reviewDue: true },
      take: 6,
      orderBy: { openedDate: "asc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        therapist: { select: { firstName: true, lastName: true } },
      },
    }),
    // open invoices: count + sums in the database instead of loading every unpaid row
    db.invoice.aggregate({
      where: { clinicId: auth.clinicId, status: { in: ["UNPAID", "PARTIAL"] } },
      _count: { _all: true },
      _sum: { totalCents: true, paidCents: true },
    }),
    // ONE payments query covers the period total, the revenue-by-arrangement split AND the revenue chart
    db.payment.findMany({
      where: { clinicId: auth.clinicId, paidAt: { gte: payFrom, lte: payTo } },
      select: { paidAt: true, amountCents: true, invoice: { select: { arrangement: true } } },
    }),
    db.appointment.findMany({
      where: { clinicId: auth.clinicId, date: { gte: day0, lte: dayEnd } },
      orderBy: { startMin: "asc" },
      take: 10,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        therapist: { select: { id: true, firstName: true, lastName: true } },
        episode: { select: { id: true, title: true } },
      },
    }),
    db.appointment.findMany({
      where: { clinicId: auth.clinicId, date: { gt: dayEnd }, status: { in: ["SCHEDULED", "CONFIRMED"] } },
      orderBy: [{ date: "asc" }, { startMin: "asc" }],
      take: 6,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        therapist: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    db.treatmentEpisode.findMany({
      where: { clinicId: auth.clinicId, status: { in: ["ACTIVE_TREATMENT", "AWAITING_PLAN", "UNDER_REVIEW"] } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } },
        therapist: { select: { firstName: true, lastName: true } },
      },
    }),
    db.treatmentEpisode.findMany({
      where: { clinicId: auth.clinicId, status: "DISCHARGED" },
      orderBy: { closedDate: "desc" },
      take: 4,
      include: { patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } } },
    }),
    db.payment.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { paidAt: "desc" },
      take: 5,
      include: { invoice: { include: { patient: { select: { firstName: true, lastName: true, patientCode: true } } } } },
    }),
    db.patient.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, firstName: true, lastName: true, patientCode: true, createdAt: true },
    }),
    db.therapySession.findMany({
      where: { clinicId: auth.clinicId, status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 4,
      include: {
        patient: { select: { firstName: true, lastName: true, patientCode: true } },
        therapist: { select: { firstName: true, lastName: true } },
        episode: { select: { title: true } },
      },
    }),
    db.auditLog.findMany({
      where: { clinicId: auth.clinicId },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
    // charts: appointments, revenue, sessions and registrations over the chart window
    // grouped in the database: one row per distinct (date, status) instead of one per appointment
    db.appointment.groupBy({
      by: ["date", "status"],
      where: { clinicId: auth.clinicId, date: { gte: chartStart, lte: chartEnd } },
      _count: { _all: true },
    }),
    db.therapySession.groupBy({
      by: ["date"],
      where: { clinicId: auth.clinicId, status: "COMPLETED", date: { gte: chartStart, lte: chartEnd } },
      _count: { _all: true },
    }),
    db.patient.findMany({
      where: { clinicId: auth.clinicId, createdAt: { gte: chartStart, lte: chartEnd } },
      select: { createdAt: true },
    }),
  ]);

  // period total + split by arrangement + chart series, all from the single payments query
  let payg = 0, pkg = 0, ins = 0, periodTotal = 0;
  const chartRevenue: { paidAt: Date; amountCents: number }[] = [];
  for (const p of periodPayments) {
    if (p.paidAt >= start && p.paidAt <= end) {
      periodTotal += p.amountCents;
      if (p.invoice.arrangement === "PACKAGE") pkg += p.amountCents;
      else if (p.invoice.arrangement === "INSURANCE") ins += p.amountCents;
      else payg += p.amountCents;
    }
    if (p.paidAt >= chartStart && p.paidAt <= chartEnd) chartRevenue.push(p);
  }

  const outstanding = (outstandingAgg._sum.totalCents ?? 0) - (outstandingAgg._sum.paidCents ?? 0);

  // per-day trend series over the chart window
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const trend: { day: string; date: string; appointments: number; sessions: number; revenue: number; newPatients: number }[] = [];
  const idx = new Map<string, number>();
  const spanDays = Math.round((chartEnd.getTime() - chartStart.getTime()) / MS_DAY) + 1;
  for (let i = 0; i < spanDays; i++) {
    const dd = new Date(chartStart); dd.setDate(dd.getDate() + i);
    idx.set(dayKey(dd), trend.length);
    trend.push({
      day: dd.toLocaleDateString("en-GB", spanDays <= 7 ? { weekday: "short" } : { day: "numeric", month: "short" }),
      date: dd.toISOString(), appointments: 0, sessions: 0, revenue: 0, newPatients: 0,
    });
  }
  for (const a of chartAppointments) {
    if (["CANCELLED", "NO_SHOW"].includes(a.status)) continue;
    const i = idx.get(dayKey(new Date(a.date))); if (i !== undefined) trend[i].appointments += a._count._all;
  }
  for (const x of chartSessions) { const i = idx.get(dayKey(new Date(x.date))); if (i !== undefined) trend[i].sessions += x._count._all; }
  for (const x of chartPatients) { const i = idx.get(dayKey(new Date(x.createdAt))); if (i !== undefined) trend[i].newPatients++; }
  for (const p of chartRevenue) { const i = idx.get(dayKey(new Date(p.paidAt))); if (i !== undefined) trend[i].revenue += p.amountCents; }
  for (const t of trend) t.revenue = Math.round(t.revenue / 100);

  // appointment status breakdown over the chart window
  const statusCounts: Record<string, number> = {};
  for (const a of chartAppointments) statusCounts[a.status] = (statusCounts[a.status] || 0) + a._count._all;
  const appointmentStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count })).sort((x, y) => y.count - x.count);

  return json({
    metrics: {
      totalPatients,
      newPatients,
      activeEpisodes,
      todaysAppointments: todaysAppointmentsCount,
      completedSessions,
      reviewsDue: reviewsDueCount,
      outstandingInvoices: outstandingAgg._count._all,
      outstandingAmountCents: outstanding,
      revenueCollectedCents: periodTotal,
    },
    revenue: { paygCents: payg, packageCents: pkg, insuranceCents: ins },
    reviewsDue: reviewsDueEpisodes.map((e) => ({
      id: e.id, patientId: e.patient.id, patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      patientCode: e.patient.patientCode, episodeTitle: e.title, sessionsSinceReview: e.sessionsSinceReview,
      threshold: e.reviewThreshold, therapist: e.therapist ? `${e.therapist.firstName} ${e.therapist.lastName}` : "—",
    })),
    todaysAppointments: todaysAppointments.map((a) => ({
      id: a.id, patientId: a.patient.id, patientName: `${a.patient.firstName} ${a.patient.lastName}`,
      patientCode: a.patient.patientCode, time: a.startMin, status: a.status, purpose: a.purpose,
      therapist: a.therapist ? `${a.therapist.firstName} ${a.therapist.lastName}` : "—", episodeTitle: a.episode?.title || null,
    })),
    upcomingAppointments: upcoming.map((a) => ({
      id: a.id, patientId: a.patient.id, patientName: `${a.patient.firstName} ${a.patient.lastName}`,
      date: a.date, time: a.startMin, status: a.status,
      therapist: a.therapist ? `${a.therapist.firstName} ${a.therapist.lastName}` : "—",
    })),
    activeEpisodesList: activeEpisodeList.map((e) => ({
      id: e.id, patientId: e.patient.id, patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      patientCode: e.patient.patientCode, title: e.title, status: e.status, sessions: e.totalCompletedSessions,
      sinceReview: e.sessionsSinceReview, threshold: e.reviewThreshold,
      therapist: e.therapist ? `${e.therapist.firstName} ${e.therapist.lastName}` : "—",
    })),
    overdueForReview: reviewsDueEpisodes.slice(0, 5).map((e) => ({
      id: e.id, patientId: e.patient.id, patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      sessionsSinceReview: e.sessionsSinceReview, threshold: e.reviewThreshold,
    })),
    recentlyDischarged: recentlyDischarged.map((e) => ({
      id: e.id, patientId: e.patient.id, patientName: `${e.patient.firstName} ${e.patient.lastName}`,
      closedDate: e.closedDate,
    })),
    activity: {
      registrations: recentRegistrations.map((p) => ({ id: p.id, name: `${p.firstName} ${p.lastName}`, code: p.patientCode, date: p.createdAt })),
      payments: recentPayments.map((p) => ({
        id: p.id, patient: p.invoice.patient ? `${p.invoice.patient.firstName} ${p.invoice.patient.lastName}` : "—",
        amountCents: p.amountCents, method: p.method, date: p.paidAt,
      })),
      sessions: recentSessions.map((s) => ({
        id: s.id, patient: `${s.patient.firstName} ${s.patient.lastName}`, episode: s.episode?.title || "",
        therapist: s.therapist ? `${s.therapist.firstName} ${s.therapist.lastName}` : "—", date: s.completedAt || s.date,
      })),
      audit: recentAudit.map((a) => ({ id: a.id, action: a.action, userName: a.userName, date: a.createdAt, entityType: a.entityType })),
    },
    charts: { trend, appointmentStatus, windowDays: spanDays },
  });
});
