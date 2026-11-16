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

  const [
    totalPatients, newPatients, activeEpisodes, todaysAppointmentsCount,
    completedSessions, reviewsDueEpisodes, outstandingInvoices, paymentsInRange,
    paygRevenue,
    todaysAppointments, upcoming, activeEpisodeList, overdueList, recentlyDischarged,
    recentPayments, recentRegistrations, recentSessions, recentAudit,
    chartAppointments, chartRevenue, chartSessions, chartPatients,
  ] = await Promise.all([
    db.patient.count({ where: { clinicId: auth.clinicId } }),
    db.patient.count({ where: { clinicId: auth.clinicId, createdAt: { gte: start, lte: end } } }),
    db.treatmentEpisode.count({ where: { clinicId: auth.clinicId, status: { in: ["ACTIVE_TREATMENT", "AWAITING_PLAN", "UNDER_REVIEW", "ASSESSMENT_IN_PROGRESS"] } } }),
    db.appointment.count({ where: { clinicId: auth.clinicId, date: { gte: day0, lte: dayEnd }, status: { notIn: ["CANCELLED", "NO_SHOW"] } } }),
    db.therapySession.count({ where: { clinicId: auth.clinicId, status: "COMPLETED", date: { gte: start, lte: end } } }),
    db.treatmentEpisode.findMany({
      where: { clinicId: auth.clinicId, reviewDue: true },
      take: 6,
      orderBy: { openedDate: "asc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, patientCode: true, phone: true } },
        therapist: { select: { firstName: true, lastName: true } },
      },
    }),
    db.invoice.findMany({
      where: { clinicId: auth.clinicId, status: { in: ["UNPAID", "PARTIAL"] } },
      select: { totalCents: true, paidCents: true },
    }),
    db.payment.aggregate({ where: { clinicId: auth.clinicId, paidAt: { gte: start, lte: end } }, _sum: { amountCents: true } }),
    // revenue by arrangement: payments joined via invoices
    db.payment.groupBy({
      by: ["invoiceId"],
      where: { clinicId: auth.clinicId, paidAt: { gte: start, lte: end } },
      _sum: { amountCents: true },
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
      where: { clinicId: auth.clinicId, reviewDue: true },
      take: 5,
      include: { patient: { select: { id: true, firstName: true, lastName: true, patientCode: true } } },
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
    db.appointment.findMany({
      where: { clinicId: auth.clinicId, date: { gte: chartStart, lte: chartEnd } },
      select: { date: true, status: true },
    }),
    db.payment.findMany({
      where: { clinicId: auth.clinicId, paidAt: { gte: chartStart, lte: chartEnd } },
      select: { paidAt: true, amountCents: true },
    }),
    db.therapySession.findMany({
      where: { clinicId: auth.clinicId, status: "COMPLETED", date: { gte: chartStart, lte: chartEnd } },
      select: { date: true },
    }),
    db.patient.findMany({
      where: { clinicId: auth.clinicId, createdAt: { gte: chartStart, lte: chartEnd } },
      select: { createdAt: true },
    }),
  ]);

  // revenue split by arrangement
  const paymentInvoiceIds = (paygRevenue as unknown) as { invoiceId: string; _sum: { amountCents: number | null } }[];
  const invoiceIds = paymentInvoiceIds.map((p) => p.invoiceId);
  const invoices = invoiceIds.length
    ? await db.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, arrangement: true } })
    : [];
  const arrangementMap = new Map(invoices.map((i) => [i.id, i.arrangement]));
  let payg = 0, pkg = 0, ins = 0;
  const payments = await db.payment.findMany({
    where: { clinicId: auth.clinicId, paidAt: { gte: start, lte: end } },
    select: { invoiceId: true, amountCents: true },
  });
  for (const p of payments) {
    const arr = arrangementMap.get(p.invoiceId);
    if (arr === "PACKAGE") pkg += p.amountCents;
    else if (arr === "INSURANCE") ins += p.amountCents;
    else payg += p.amountCents;
  }

  const outstanding = outstandingInvoices.reduce((s, i) => s + (i.totalCents - i.paidCents), 0);

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
    const i = idx.get(dayKey(new Date(a.date))); if (i !== undefined) trend[i].appointments++;
  }
  for (const x of chartSessions) { const i = idx.get(dayKey(new Date(x.date))); if (i !== undefined) trend[i].sessions++; }
  for (const x of chartPatients) { const i = idx.get(dayKey(new Date(x.createdAt))); if (i !== undefined) trend[i].newPatients++; }
  for (const p of chartRevenue) { const i = idx.get(dayKey(new Date(p.paidAt))); if (i !== undefined) trend[i].revenue += p.amountCents; }
  for (const t of trend) t.revenue = Math.round(t.revenue / 100);

  // appointment status breakdown over the chart window
  const statusCounts: Record<string, number> = {};
  for (const a of chartAppointments) statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
  const appointmentStatus = Object.entries(statusCounts).map(([status, count]) => ({ status, count })).sort((x, y) => y.count - x.count);

  return json({
    metrics: {
      totalPatients,
      newPatients,
      activeEpisodes,
      todaysAppointments: todaysAppointmentsCount,
      completedSessions,
      reviewsDue: reviewsDueEpisodes.length,
      outstandingInvoices: outstandingInvoices.length,
      outstandingAmountCents: outstanding,
      revenueCollectedCents: paymentsInRange._sum.amountCents || 0,
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
    overdueForReview: overdueList.map((e) => ({
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
