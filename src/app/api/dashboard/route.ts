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

  const day0 = new Date(); day0.setHours(0, 0, 0, 0);
  const dayEnd = new Date(); dayEnd.setHours(23, 59, 59, 999);

  const [
    totalPatients, newPatients, activeEpisodes, todaysAppointmentsCount,
    completedSessions, reviewsDueEpisodes, outstandingInvoices, paymentsInRange,
    paygRevenue,
    todaysAppointments, upcoming, activeEpisodeList, overdueList, recentlyDischarged,
    recentPayments, recentRegistrations, recentSessions, recentAudit,
    chartAppointments, chartRevenue,
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
    // charts: appointments & revenue last 7 days
    db.appointment.findMany({
      where: {
        clinicId: auth.clinicId,
        date: { gte: new Date(new Date().setDate(new Date().getDate() - 6)), lte: dayEnd },
      },
      select: { date: true, status: true },
    }),
    db.payment.findMany({
      where: {
        clinicId: auth.clinicId,
        paidAt: { gte: new Date(new Date().setDate(new Date().getDate() - 6)), lte: dayEnd },
      },
      select: { paidAt: true, amountCents: true },
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

  // build 7-day chart series
  const chart: { day: string; appointments: number; sessions: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i); dd.setHours(0, 0, 0, 0);
    const ddEnd = new Date(dd); ddEnd.setHours(23, 59, 59, 999);
    const appts = chartAppointments.filter((a) => {
      const t = new Date(a.date).getTime();
      return t >= dd.getTime() && t <= ddEnd.getTime() && !["CANCELLED", "NO_SHOW"].includes(a.status);
    }).length;
    chart.push({ day: dd.toLocaleDateString("en-GB", { weekday: "short" }), appointments: appts, sessions: 0 });
  }

  const revenueChart: { day: string; revenue: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const dd = new Date(); dd.setDate(dd.getDate() - i); dd.setHours(0, 0, 0, 0);
    const ddEnd = new Date(dd); ddEnd.setHours(23, 59, 59, 999);
    const rev = chartRevenue.filter((p) => {
      const t = new Date(p.paidAt).getTime();
      return t >= dd.getTime() && t <= ddEnd.getTime();
    }).reduce((s, p) => s + p.amountCents, 0);
    revenueChart.push({ day: dd.toLocaleDateString("en-GB", { weekday: "short" }), revenue: Math.round(rev / 100) });
  }

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
        therapist: `${s.therapist.firstName} ${s.therapist.lastName}`, date: s.completedAt || s.date,
      })),
      audit: recentAudit.map((a) => ({ id: a.id, action: a.action, userName: a.userName, date: a.createdAt, entityType: a.entityType })),
    },
    charts: { appointmentsByDay: chart, revenueByDay: revenueChart },
  });
});
