// ============ API: Reports (patients / appointments / clinical / financial / staff) ============
// Business Rules: only COMPLETED therapy sessions count for clinical workload;
// "unique patients" = distinct patientId across those completed sessions.
import { db, route, json, getQuery, ApiError, requirePermission } from "@/server/api-exports";
import { PERMS, PAYMENT_METHODS } from "@/lib/constants";
import { fixedSalaryForPeriod } from "@/lib/remuneration";

const OPEN_EPISODE_STATUSES = ["AWAITING_ASSESSMENT", "ASSESSMENT_IN_PROGRESS", "AWAITING_PLAN", "ACTIVE_TREATMENT", "ON_HOLD", "UNDER_REVIEW"];
const REPORT_TYPES = ["patients", "appointments", "clinical", "financial", "staff"] as const;
type ReportType = (typeof REPORT_TYPES)[number];

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

function resolveRange(from: string | null, to: string | null): { start: Date; end: Date } {
  const now = new Date();
  const s = parseQueryDate(from);
  const e = parseQueryDate(to, true);
  if (s && e) return { start: s, end: e };
  // default: last 30 days (consistent with dashboard "month")
  const start = new Date(now);
  start.setDate(start.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/** Last-6-calendar-months buckets [{key, label}] ending with current month. */
function monthBuckets(now: Date, months = 6): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-GB", { month: "short" }) });
  }
  return out;
}

function countByMonth<T>(rows: T[], getDate: (r: T) => Date, now: Date, getCount: (r: T) => number = () => 1): { month: string; count: number }[] {
  const buckets = monthBuckets(now);
  const map = new Map(buckets.map((b) => [b.key, 0]));
  for (const r of rows) {
    const d = getDate(r);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (map.has(key)) map.set(key, (map.get(key) || 0) + getCount(r));
  }
  return buckets.map((b) => ({ month: b.label, count: map.get(b.key) || 0 }));
}

function tally<T>(rows: T[], getKey: (r: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const k = getKey(r);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

const patientCols = { id: true, firstName: true, lastName: true, patientCode: true } as const;
const therapistCols = { firstName: true, lastName: true } as const;
const pname = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`;

// ---------------- Report builders ----------------

async function patientsReport(clinicId: string, start: Date, end: Date, now: Date) {
  const sixMonthsAgo = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));

  const [totalRegistered, newPatients, activeEpisodes, dischargedEpisodes, referrals, multiEpisodeRows, earlierSessionRows, registrationRows] =
    await Promise.all([
      db.patient.count({ where: { clinicId } }),
      db.patient.count({ where: { clinicId, createdAt: { gte: start, lte: end } } }),
      db.treatmentEpisode.count({ where: { clinicId, status: { in: OPEN_EPISODE_STATUSES } } }),
      db.treatmentEpisode.findMany({
        where: { clinicId, status: "DISCHARGED", closedDate: { gte: start, lte: end } },
        orderBy: { closedDate: "desc" },
        take: 50,
        select: { id: true, closedDate: true, totalCompletedSessions: true, title: true, patient: { select: patientCols }, therapist: { select: therapistCols } },
      }),
      db.patientReferral.groupBy({ by: ["source"], where: { patient: { clinicId } }, _count: { _all: true } }),
      // only patients with more than one episode come back (HAVING), not one row per patient
      db.treatmentEpisode.groupBy({ by: ["patientId"], where: { clinicId }, having: { patientId: { _count: { gt: 1 } } }, _count: { patientId: true } }),
      db.therapySession.findMany({
        where: { clinicId, date: { lt: start }, status: "COMPLETED" },
        distinct: ["patientId"],
        select: { patientId: true },
      }),
      db.patient.findMany({ where: { clinicId, createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true } }),
    ]);

  // returning = >1 episode ever OR has completed sessions before the range
  const returningIds = new Set<string>();
  for (const r of multiEpisodeRows) if (r._count.patientId > 1) returningIds.add(r.patientId);
  for (const r of earlierSessionRows) returningIds.add(r.patientId);

  return {
    stats: {
      totalRegistered,
      newPatients,
      returningPatients: returningIds.size,
      activeEpisodes,
      dischargedCount: dischargedEpisodes.length,
    },
    referralSources: referrals
      .map((r) => ({ source: r.source, count: r._count._all }))
      .sort((a, b) => b.count - a.count),
    registrationsByMonth: countByMonth(registrationRows, (r) => new Date(r.createdAt), now),
    discharged: dischargedEpisodes.map((e) => ({
      id: e.id,
      patientName: pname(e.patient),
      patientCode: e.patient.patientCode,
      episodeTitle: e.title,
      sessions: e.totalCompletedSessions,
      therapist: e.therapist ? pname(e.therapist) : "—",
      closedDate: e.closedDate,
    })),
  };
}

async function appointmentsReport(clinicId: string, start: Date, end: Date, now: Date) {
  const dayFrom = new Date(new Date(now).setDate(now.getDate() - 13));
  dayFrom.setHours(0, 0, 0, 0);
  // counts are grouped in the database; no per-appointment rows are loaded
  const [apptGroups, dayGroups] = await Promise.all([
    db.appointment.groupBy({
      by: ["status", "therapistId"],
      where: { clinicId, date: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    db.appointment.groupBy({
      by: ["date", "status"],
      where: { clinicId, date: { gte: dayFrom } },
      _count: { _all: true },
    }),
  ]);

  const statusMap = new Map<string, number>();
  const perTherapist = new Map<string, { completed: number; cancelled: number; noShow: number }>();
  let total = 0;
  for (const g of apptGroups) {
    const n = g._count._all;
    total += n;
    statusMap.set(g.status, (statusMap.get(g.status) || 0) + n);
    const row = perTherapist.get(g.therapistId) || { completed: 0, cancelled: 0, noShow: 0 };
    if (g.status === "COMPLETED") row.completed += n;
    else if (g.status === "CANCELLED") row.cancelled += n;
    else if (g.status === "NO_SHOW") row.noShow += n;
    perTherapist.set(g.therapistId, row);
  }
  const byStatus = [...statusMap.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
  const get = (st: string) => statusMap.get(st) || 0;

  const therapistIds = [...perTherapist.keys()];
  const therapists = therapistIds.length
    ? await db.staffProfile.findMany({ where: { id: { in: therapistIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const tNames = new Map(therapists.map((t) => [t.id, pname(t)]));
  const byTherapist = [...perTherapist.entries()]
    .map(([id, v]) => ({ id, therapist: tNames.get(id) || "Unknown", ...v }))
    .sort((a, b) => b.completed - a.completed);

  // last 14 days trend (all appointments + completed)
  const days: { day: string; total: number; completed: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const dEnd = new Date(d);
    dEnd.setHours(23, 59, 59, 999);
    let dayTotal = 0, dayCompleted = 0;
    for (const g of dayGroups) {
      const t = new Date(g.date).getTime();
      if (t >= d.getTime() && t <= dEnd.getTime()) {
        dayTotal += g._count._all;
        if (g.status === "COMPLETED") dayCompleted += g._count._all;
      }
    }
    days.push({ day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }), total: dayTotal, completed: dayCompleted });
  }

  return {
    stats: {
      total,
      completed: get("COMPLETED"),
      cancelled: get("CANCELLED"),
      noShows: get("NO_SHOW"),
      attendedNoTreatment: get("ATTENDED_NO_TREATMENT"),
      upcoming: get("SCHEDULED") + get("CONFIRMED") + get("RESCHEDULED"),
    },
    byStatus: byStatus.map((b) => ({ status: b.key, count: b.count })),
    byTherapist,
    byDay: days,
  };
}

async function clinicalReport(clinicId: string, start: Date, end: Date, now: Date) {
  const sixMonthsAgo = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 5, 1));

  const [completedSessions, activeEpisodes, reviewDueEpisodes, monthSessionGroups, discharges, closedAgg, allAgg] =
    await Promise.all([
      db.therapySession.count({ where: { clinicId, status: "COMPLETED", date: { gte: start, lte: end } } }),
      db.treatmentEpisode.count({ where: { clinicId, status: { in: OPEN_EPISODE_STATUSES } } }),
      db.treatmentEpisode.findMany({
        where: { clinicId, reviewDue: true },
        orderBy: { sessionsSinceReview: "desc" },
        take: 50,
        select: {
          id: true, title: true, sessionsSinceReview: true, reviewThreshold: true, totalCompletedSessions: true,
          patient: { select: patientCols }, therapist: { select: therapistCols },
        },
      }),
      db.therapySession.groupBy({
        by: ["date"],
        where: { clinicId, status: "COMPLETED", date: { gte: sixMonthsAgo, lte: end } },
        _count: { _all: true },
      }),
      db.discharge.findMany({
        where: { clinicId, status: "COMPLETED", dischargeDate: { gte: start, lte: end } },
        select: { id: true, reason: true, objectiveOutcomes: true, therapistId: true, patient: { select: patientCols } },
      }),
      db.treatmentEpisode.aggregate({
        where: { clinicId, status: "DISCHARGED", closedDate: { gte: start, lte: end } },
        _avg: { totalCompletedSessions: true },
        _count: { _all: true },
      }),
      db.treatmentEpisode.aggregate({ where: { clinicId }, _avg: { totalCompletedSessions: true }, _count: { _all: true } }),
    ]);

  const avgSource = closedAgg._count._all ? closedAgg : allAgg;
  const averageSessionsPerEpisode = avgSource._count._all
    ? Math.round((avgSource._avg.totalCompletedSessions ?? 0) * 10) / 10
    : 0;

  const byReason = tally(discharges, (d) => d.reason).map((r) => ({ reason: r.key, count: r.count }));
  const objectivesAchieved = discharges.filter((d) => d.reason === "Treatment objectives achieved").length;

  // Discharge has no therapist relation — resolve names from staff profiles
  const dischargeTherapistIds = [...new Set(discharges.map((d) => d.therapistId).filter(Boolean))];
  const dTherapists = dischargeTherapistIds.length
    ? await db.staffProfile.findMany({ where: { id: { in: dischargeTherapistIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const dTherapistNames = new Map(dTherapists.map((t) => [t.id, pname(t)]));

  return {
    stats: {
      completedSessions,
      activeEpisodes,
      reviewsDue: reviewDueEpisodes.length,
      discharges: discharges.length,
      averageSessionsPerEpisode,
    },
    sessionsByMonth: countByMonth(monthSessionGroups, (r) => new Date(r.date), now, (r) => r._count._all),
    reviewsDueList: reviewDueEpisodes.map((e) => ({
      id: e.id,
      patientName: pname(e.patient),
      patientCode: e.patient.patientCode,
      episodeTitle: e.title,
      sessionsSinceReview: e.sessionsSinceReview,
      threshold: e.reviewThreshold,
      totalSessions: e.totalCompletedSessions,
      therapist: e.therapist ? pname(e.therapist) : "—",
    })),
    dischargeStats: {
      discharges: discharges.length,
      byReason,
      treatmentOutcomes: {
        objectivesAchieved,
        other: discharges.length - objectivesAchieved,
      },
    },
    dischargedPatients: discharges.slice(0, 20).map((d) => ({
      id: d.id,
      patientName: pname(d.patient),
      reason: d.reason,
      therapist: dTherapistNames.get(d.therapistId) || "—",
    })),
  };
}

async function financialReport(clinicId: string, start: Date, end: Date) {
  const [payments, outstandingAgg, outstanding, refundAgg, claimGroups, packageAgg] = await Promise.all([
    // arrangement comes with each payment (join) — no second lookup by invoice id
    db.payment.findMany({
      where: { clinicId, paidAt: { gte: start, lte: end } },
      select: { amountCents: true, method: true, invoice: { select: { arrangement: true } } },
    }),
    // true totals from the database (the list below is capped at 200 rows)
    db.invoice.aggregate({
      where: { clinicId, status: { in: ["UNPAID", "PARTIAL"] } },
      _count: { _all: true },
      _sum: { totalCents: true, paidCents: true },
    }),
    db.invoice.findMany({
      where: { clinicId, status: { in: ["UNPAID", "PARTIAL"] } },
      orderBy: { issuedAt: "desc" },
      take: 200,
      select: {
        id: true, invoiceNumber: true, totalCents: true, paidCents: true, status: true,
        dueDate: true, issuedAt: true, arrangement: true, patient: { select: patientCols },
      },
    }),
    db.refund.aggregate({ where: { clinicId, refundedAt: { gte: start, lte: end } }, _sum: { amountCents: true } }),
    db.insuranceClaim.groupBy({ by: ["status"], where: { clinicId }, _sum: { claimedCents: true, approvedCents: true }, _count: { _all: true } }),
    db.patientPackage.aggregate({
      where: { clinicId, status: { in: ["ACTIVE", "EXHAUSTED"] } },
      _sum: { usedSessions: true, totalSessions: true },
    }),
  ]);

  // revenue split by invoice arrangement
  let paygCents = 0, packageCents = 0, insuranceCents = 0;
  for (const p of payments) {
    const arr = p.invoice.arrangement;
    if (arr === "PACKAGE") packageCents += p.amountCents;
    else if (arr === "INSURANCE") insuranceCents += p.amountCents;
    else paygCents += p.amountCents;
  }

  // revenue by payment method (ordered by canonical list, then extras)
  const methodMap = new Map<string, number>();
  for (const p of payments) methodMap.set(p.method, (methodMap.get(p.method) || 0) + p.amountCents);
  const revenueByMethod = [
    ...PAYMENT_METHODS.filter((m) => methodMap.has(m)).map((m) => ({ method: m, amountCents: methodMap.get(m) || 0 })),
    ...[...methodMap.entries()].filter(([m]) => !PAYMENT_METHODS.includes(m as never)).map(([method, amountCents]) => ({ method, amountCents })),
  ];

  const outstandingRows = outstanding
    .map((i) => ({ ...i, outstandingCents: Math.max(0, i.totalCents - i.paidCents) }))
    .sort((a, b) => b.outstandingCents - a.outstandingCents);
  const outstandingCents = Math.max(0, (outstandingAgg._sum.totalCents ?? 0) - (outstandingAgg._sum.paidCents ?? 0));
  const refundsCents = refundAgg._sum.amountCents ?? 0;

  const open = claimGroups.find((c) => c.status === "SUBMITTED");
  const claimsSummary = {
    open: open?._count._all ?? 0,
    submittedCents: open?._sum.claimedCents ?? 0,
    approvedCents: claimGroups
      .filter((c) => ["APPROVED", "PARTIALLY_APPROVED", "PAID"].includes(c.status))
      .reduce((s, c) => s + (c._sum.approvedCents ?? 0), 0),
    outstandingCents: Math.max(0, (open?._sum.claimedCents ?? 0) - (open?._sum.approvedCents ?? 0)),
  };

  const usedSessions = packageAgg._sum.usedSessions ?? 0;
  const totalSessions = packageAgg._sum.totalSessions ?? 0;
  const packageUtilisation = {
    usedSessions,
    totalSessions,
    percent: totalSessions > 0 ? Math.round((usedSessions / totalSessions) * 100) : 0,
  };

  return {
    stats: {
      totalRevenueCents: payments.reduce((s, p) => s + p.amountCents, 0),
      outstandingCents,
      outstandingCount: outstandingAgg._count._all,
      refundsCents,
    },
    revenueByMethod,
    byArrangement: { paygCents, packageCents, insuranceCents },
    claims: claimsSummary,
    packageUtilisation,
    outstandingList: outstandingRows.slice(0, 10).map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      patientName: pname(i.patient),
      totalCents: i.totalCents,
      paidCents: i.paidCents,
      outstandingCents: i.outstandingCents,
      status: i.status,
      arrangement: i.arrangement,
      dueDate: i.dueDate,
      issuedAt: i.issuedAt,
    })),
  };
}

async function staffReport(clinicId: string, start: Date, end: Date) {
  const [therapists, sessions, episodeRows, salaried] = await Promise.all([
    db.staffProfile.findMany({
      where: { clinicId, isTherapist: true },
      select: { id: true, firstName: true, lastName: true, jobTitle: true, remunerationMethod: true, remunerationRateCents: true },
      orderBy: [{ firstName: "asc" }],
    }),
    // one row per (therapist, patient) pair with its session count, instead of one row per session
    db.therapySession.groupBy({
      by: ["therapistId", "patientId"],
      where: { clinicId, status: "COMPLETED", date: { gte: start, lte: end } },
      _count: { _all: true },
    }),
    db.treatmentEpisode.findMany({
      where: { clinicId, status: { in: OPEN_EPISODE_STATUSES }, therapistId: { not: null } },
      select: { therapistId: true },
    }),
    // non-clinical staff on a monthly salary
    db.staffProfile.findMany({
      where: { clinicId, isTherapist: false, employmentStatus: { in: ["ACTIVE", "ON_LEAVE"] }, remunerationRateCents: { gt: 0 } },
      select: { remunerationRateCents: true },
    }),
  ]);
  const salariesCents = salaried.reduce((sum, p) => sum + fixedSalaryForPeriod(p.remunerationRateCents || 0, start, end), 0);

  const per = new Map<string, { completedSessions: number; patients: Set<string> }>();
  for (const s of sessions) {
    const row = per.get(s.therapistId) || { completedSessions: 0, patients: new Set<string>() };
    row.completedSessions += s._count._all;
    row.patients.add(s.patientId);
    per.set(s.therapistId, row);
  }
  const activeEpisodes = new Map<string, number>();
  for (const e of episodeRows) {
    if (e.therapistId) activeEpisodes.set(e.therapistId, (activeEpisodes.get(e.therapistId) || 0) + 1);
  }

  const rows = therapists.map((t) => {
    const p = per.get(t.id) || { completedSessions: 0, patients: new Set<string>() };
    const uniquePatients = p.patients.size;
    const rateCents = t.remunerationRateCents ?? null;
    let computedCents: number | null = null;
    if (rateCents !== null && t.remunerationMethod === "PER_SESSION") computedCents = p.completedSessions * rateCents;
    else if (rateCents !== null && t.remunerationMethod === "PER_PATIENT") computedCents = uniquePatients * rateCents;
    else if (rateCents !== null && t.remunerationMethod === "FIXED") computedCents = fixedSalaryForPeriod(rateCents, start, end);
    return {
      id: t.id,
      name: `${t.firstName} ${t.lastName}`,
      jobTitle: t.jobTitle,
      completedSessions: p.completedSessions,
      uniquePatients,
      activeEpisodes: activeEpisodes.get(t.id) || 0,
      remunerationMethod: t.remunerationMethod,
      rateCents,
      computedCents,
    };
  }).sort((a, b) => b.completedSessions - a.completedSessions);

  return {
    stats: {
      therapists: therapists.length,
      totalCompletedSessions: sessions.reduce((n, s) => n + s._count._all, 0),
      uniquePatientsSeen: new Set(sessions.map((s) => s.patientId)).size,
      estimatedRemunerationCents: rows.reduce((s, r) => s + (r.computedCents || 0), 0) + salariesCents,
      staffSalariesCents: salariesCents,
    },
    rows,
  };
}

export const GET = route(async (req) => {
  const auth = requirePermission(req, PERMS.reportsView);

  const typeParam = getQuery(req, "type") || "patients";
  if (!REPORT_TYPES.includes(typeParam as ReportType)) {
    throw new ApiError(400, `Unknown report type "${typeParam}". Valid: ${REPORT_TYPES.join(", ")}`);
  }
  const type = typeParam as ReportType;

  const { start, end } = resolveRange(getQuery(req, "from"), getQuery(req, "to"));
  const now = new Date();

  const run = (s: Date, e: Date): Promise<unknown> => {
    if (type === "patients") return patientsReport(auth.clinicId, s, e, now);
    if (type === "appointments") return appointmentsReport(auth.clinicId, s, e, now);
    if (type === "clinical") return clinicalReport(auth.clinicId, s, e, now);
    if (type === "financial") return financialReport(auth.clinicId, s, e);
    return staffReport(auth.clinicId, s, e);
  };

  // optional previous period (for the change chips) — computed in parallel in the same request
  const prevStart = parseQueryDate(getQuery(req, "prevFrom"));
  const prevEnd = parseQueryDate(getQuery(req, "prevTo"), true);
  const [report, prevReport] = await Promise.all([
    run(start, end),
    prevStart && prevEnd ? run(prevStart, prevEnd) : Promise.resolve(undefined),
  ]);

  return json({ type, from: start.toISOString(), to: end.toISOString(), report, ...(prevReport !== undefined ? { prevReport } : {}) });
});
