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

function countByMonth<T>(rows: T[], getDate: (r: T) => Date, now: Date): { month: string; count: number }[] {
  const buckets = monthBuckets(now);
  const map = new Map(buckets.map((b) => [b.key, 0]));
  for (const r of rows) {
    const d = getDate(r);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    if (map.has(key)) map.set(key, (map.get(key) || 0) + 1);
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
      db.patientReferral.findMany({ where: { patient: { clinicId } }, select: { source: true } }),
      db.treatmentEpisode.groupBy({ by: ["patientId"], where: { clinicId }, _count: { patientId: true } }),
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
    referralSources: tally(referrals, (r) => r.source).map((r) => ({ source: r.key, count: r.count })),
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
  const [appts, dayRows] = await Promise.all([
    db.appointment.findMany({
      where: { clinicId, date: { gte: start, lte: end } },
      select: { status: true, therapistId: true },
    }),
    db.appointment.findMany({
      where: { clinicId, date: { gte: new Date(new Date(now).setDate(now.getDate() - 13)) } },
      select: { date: true, status: true },
    }),
  ]);

  const byStatus = tally(appts, (a) => a.status);
  const get = (s: string) => byStatus.find((b) => b.key === s)?.count || 0;

  // per-therapist breakdown
  const therapistIds = [...new Set(appts.map((a) => a.therapistId))];
  const therapists = therapistIds.length
    ? await db.staffProfile.findMany({ where: { id: { in: therapistIds } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  const tNames = new Map(therapists.map((t) => [t.id, pname(t)]));
  const perTherapist = new Map<string, { completed: number; cancelled: number; noShow: number }>();
  for (const a of appts) {
    const row = perTherapist.get(a.therapistId) || { completed: 0, cancelled: 0, noShow: 0 };
    if (a.status === "COMPLETED") row.completed++;
    else if (a.status === "CANCELLED") row.cancelled++;
    else if (a.status === "NO_SHOW") row.noShow++;
    perTherapist.set(a.therapistId, row);
  }
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
    const inDay = dayRows.filter((a) => {
      const t = new Date(a.date).getTime();
      return t >= d.getTime() && t <= dEnd.getTime();
    });
    days.push({
      day: d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
      total: inDay.length,
      completed: inDay.filter((a) => a.status === "COMPLETED").length,
    });
  }

  return {
    stats: {
      total: appts.length,
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

  const [completedSessions, activeEpisodes, reviewDueEpisodes, monthSessionRows, discharges, closedEpisodes, allEpisodeRows] =
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
      db.therapySession.findMany({
        where: { clinicId, status: "COMPLETED", date: { gte: sixMonthsAgo, lte: end } },
        select: { date: true },
      }),
      db.discharge.findMany({
        where: { clinicId, status: "COMPLETED", dischargeDate: { gte: start, lte: end } },
        select: { id: true, reason: true, objectiveOutcomes: true, therapistId: true, patient: { select: patientCols } },
      }),
      db.treatmentEpisode.findMany({
        where: { clinicId, status: "DISCHARGED", closedDate: { gte: start, lte: end } },
        select: { totalCompletedSessions: true },
      }),
      db.treatmentEpisode.findMany({ where: { clinicId }, select: { totalCompletedSessions: true } }),
    ]);

  const avgSource = closedEpisodes.length
    ? closedEpisodes
    : allEpisodeRows;
  const averageSessionsPerEpisode = avgSource.length
    ? Math.round((avgSource.reduce((s, e) => s + e.totalCompletedSessions, 0) / avgSource.length) * 10) / 10
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
    sessionsByMonth: countByMonth(monthSessionRows, (r) => new Date(r.date), now),
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
  const [payments, outstanding, refunds, claims, packages] = await Promise.all([
    db.payment.findMany({
      where: { clinicId, paidAt: { gte: start, lte: end } },
      select: { invoiceId: true, amountCents: true, method: true },
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
    db.refund.findMany({ where: { clinicId, refundedAt: { gte: start, lte: end } }, select: { amountCents: true } }),
    db.insuranceClaim.findMany({ where: { clinicId }, select: { status: true, claimedCents: true, approvedCents: true } }),
    db.patientPackage.findMany({
      where: { clinicId, status: { in: ["ACTIVE", "EXHAUSTED"] } },
      select: { usedSessions: true, totalSessions: true },
    }),
  ]);

  // revenue split by invoice arrangement
  const invoiceIds = [...new Set(payments.map((p) => p.invoiceId))];
  const invoices = invoiceIds.length
    ? await db.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, arrangement: true } })
    : [];
  const arrangementMap = new Map(invoices.map((i) => [i.id, i.arrangement]));

  let paygCents = 0, packageCents = 0, insuranceCents = 0;
  for (const p of payments) {
    const arr = arrangementMap.get(p.invoiceId);
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
  const outstandingCents = outstandingRows.reduce((s, i) => s + i.outstandingCents, 0);

  const refundsCents = refunds.reduce((s, r) => s + r.amountCents, 0);

  const openClaims = claims.filter((c) => c.status === "SUBMITTED");
  const claimsSummary = {
    open: openClaims.length,
    submittedCents: openClaims.reduce((s, c) => s + c.claimedCents, 0),
    approvedCents: claims
      .filter((c) => ["APPROVED", "PARTIALLY_APPROVED", "PAID"].includes(c.status))
      .reduce((s, c) => s + c.approvedCents, 0),
    outstandingCents: openClaims.reduce((s, c) => s + Math.max(0, c.claimedCents - c.approvedCents), 0),
  };

  const usedSessions = packages.reduce((s, p) => s + p.usedSessions, 0);
  const totalSessions = packages.reduce((s, p) => s + p.totalSessions, 0);
  const packageUtilisation = {
    usedSessions,
    totalSessions,
    percent: totalSessions > 0 ? Math.round((usedSessions / totalSessions) * 100) : 0,
  };

  return {
    stats: {
      totalRevenueCents: payments.reduce((s, p) => s + p.amountCents, 0),
      outstandingCents,
      outstandingCount: outstandingRows.length,
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
    db.therapySession.findMany({
      where: { clinicId, status: "COMPLETED", date: { gte: start, lte: end } },
      select: { therapistId: true, patientId: true },
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
    row.completedSessions += 1;
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
      totalCompletedSessions: sessions.length,
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

  let report: unknown;
  if (type === "patients") report = await patientsReport(auth.clinicId, start, end, now);
  else if (type === "appointments") report = await appointmentsReport(auth.clinicId, start, end, now);
  else if (type === "clinical") report = await clinicalReport(auth.clinicId, start, end, now);
  else if (type === "financial") report = await financialReport(auth.clinicId, start, end);
  else report = await staffReport(auth.clinicId, start, end);

  return json({ type, from: start.toISOString(), to: end.toISOString(), report });
});
