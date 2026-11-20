/**
 * GMRS Physiotherapy Clinic — realistic seed data
 * Dates are generated relative to "now" so dashboard/calendar always show live data.
 * Demo login password for all users: demo1234
 */
import { PrismaClient } from "@prisma/client";
import { scryptSync, randomBytes } from "crypto";

const db = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function d(offsetDays: number, hour = 9, minute = 0): Date {
  const x = new Date();
  x.setDate(x.getDate() + offsetDays);
  x.setHours(hour, minute, 0, 0);
  return x;
}
function dayOnly(offsetDays: number): Date {
  return d(offsetDays, 0, 0);
}
function weekday(offsetDays: number): number {
  const day = new Date(d(offsetDays)).getDay();
  return day === 0 || day === 6 ? weekday(offsetDays - 1) : offsetDays;
}

async function main() {
  console.log("Seeding GMRS Physiotherapy Clinic…");
  await db.auditLog.deleteMany();
  await db.notification.deleteMany();
  await db.financialTransaction.deleteMany();
  await db.refund.deleteMany();
  await db.payment.deleteMany();
  await db.insuranceClaim.deleteMany();
  await db.invoiceItem.deleteMany();
  await db.invoice.deleteMany();
  await db.packageTransaction.deleteMany();
  await db.patientPackage.deleteMany();
  await db.packageDefinition.deleteMany();
  await db.insuranceRate.deleteMany();
  await db.insuranceProvider.deleteMany();
  await db.dischargeRecommendation.deleteMany();
  await db.discharge.deleteMany();
  await db.reviewObjectiveResult.deleteMany();
  await db.progressReview.deleteMany();
  await db.sessionVital.deleteMany();
  await db.sessionIntervention.deleteMany();
  await db.therapySession.deleteMany();
  await db.appointment.deleteMany();
  await db.planIntervention.deleteMany();
  await db.rehabilitationMilestone.deleteMany();
  await db.planObjective.deleteMany();
  await db.treatmentPlan.deleteMany();
  await db.diagnosis.deleteMany();
  await db.functionalAssessmentItem.deleteMany();
  await db.strengthMeasurement.deleteMany();
  await db.romMeasurement.deleteMany();
  await db.assessment.deleteMany();
  await db.treatmentEpisode.deleteMany();
  await db.patientReferral.deleteMany();
  await db.patientConsent.deleteMany();
  await db.medicalHistoryEntry.deleteMany();
  await db.emergencyContact.deleteMany();
  await db.service.deleteMany();
  await db.staffProfile.deleteMany();
  await db.refreshToken.deleteMany();
  await db.user.deleteMany();
  await db.role.deleteMany();
  await db.setting.deleteMany();
  await db.counter.deleteMany();
  await db.branch.deleteMany();
  await db.patient.deleteMany();
  await db.clinic.deleteMany();

  const clinic = await db.clinic.create({
    data: {
      name: "GMRS Physiotherapy & Rehab Clinic",
      code: "GMRS",
      address: "12 Liberation Road, Airport Residential Area, Accra",
      phone: "+233 30 274 1120",
      email: "info@gmrsphysio.com.gh",
    },
  });
  const branchMain = await db.branch.create({ data: { clinicId: clinic.id, name: "Osu Main Clinic", address: "12 Liberation Road, Airport Residential, Accra", phone: "+233 30 274 1120" } });
  const branchAnnex = await db.branch.create({ data: { clinicId: clinic.id, name: "Airport City Annex", address: "Airport City, Accra", phone: "+233 30 274 1155" } });

  const P = {
    dashboardView: "dashboard.view", patientsView: "patients.view", patientsManage: "patients.manage",
    appointmentsView: "appointments.view", appointmentsManage: "appointments.manage",
    clinicalView: "clinical.view", clinicalManage: "clinical.manage",
    billingView: "billing.view", billingManage: "billing.manage", billingRefund: "billing.refund",
    packagesManage: "packages.manage", insuranceManage: "insurance.manage",
    inventoryView: "inventory.view", inventoryManage: "inventory.manage",
    staffView: "staff.view", staffManage: "staff.manage", leaveApply: "leave.apply", reportsView: "reports.view", settingsManage: "settings.manage",
  };
  const allPerms = Object.values(P);

  const roleAdmin = await db.role.create({ data: { clinicId: clinic.id, name: "Clinic Administrator", description: "Full access to clinic configuration, staff and records", permissions: JSON.stringify(allPerms), system: true } });
  const roleReception = await db.role.create({ data: { clinicId: clinic.id, name: "Receptionist", description: "Front desk: registration, appointments, basic billing", permissions: JSON.stringify([P.dashboardView, P.patientsView, P.patientsManage, P.appointmentsView, P.appointmentsManage, P.billingView, P.billingManage, P.inventoryView, P.inventoryManage, P.leaveApply]), system: true } });
  const roleTherapist = await db.role.create({ data: { clinicId: clinic.id, name: "Physiotherapist", description: "Clinical care for assigned patients", permissions: JSON.stringify([P.dashboardView, P.patientsView, P.appointmentsView, P.appointmentsManage, P.clinicalView, P.clinicalManage, P.reportsView, P.leaveApply]), system: true } });
  const roleManagement = await db.role.create({ data: { clinicId: clinic.id, name: "Management", description: "Operational oversight, reports and finance", permissions: JSON.stringify([P.dashboardView, P.patientsView, P.appointmentsView, P.clinicalView, P.billingView, P.inventoryView, P.staffView, P.reportsView, P.leaveApply]), system: true } });

  // ---- Staff ----
  const mkStaff = (code: string, firstName: string, lastName: string, jobTitle: string, staffRole: string, opts: Record<string, unknown> = {}) =>
    db.staffProfile.create({
      data: {
        clinicId: clinic.id, staffCode: code, firstName, lastName, jobTitle, staffRole,
        email: (opts.email as string) || null, phone: (opts.phone as string) || null,
        department: (opts.department as string) || null,
        employmentDate: (opts.employmentDate as Date) || d(-500),
        professionalDesignation: (opts.designation as string) || null,
        specialization: (opts.specialization as string) || null,
        qualifications: JSON.stringify(opts.qualifications || []),
        availability: JSON.stringify(opts.availability || []),
        remunerationMethod: (opts.remunerationMethod as string) || "FIXED",
        remunerationRateCents: (opts.rate as number) || null,
        isTherapist: staffRole === "PHYSIOTHERAPIST",
        branchId: (opts.branchId as string) || branchMain.id,
      },
    });

  const stAdmin = await mkStaff("ST-0001", "Ama", "Boateng", "Clinic Administrator", "ADMIN", { email: "ama.boateng@gmrsphysio.com.gh", phone: "+233 24 555 1010", department: "Administration", employmentDate: d(-900) });
  const stReception = await mkStaff("ST-0002", "Kwame", "Owusu", "Front Desk Lead", "RECEPTIONIST", { email: "kwame.owusu@gmrsphysio.com.gh", phone: "+233 20 555 2020", department: "Front Desk", employmentDate: d(-620) });
  const stAkosua = await mkStaff("ST-0003", "Akosua", "Frimpong", "Senior Physiotherapist", "PHYSIOTHERAPIST", { designation: "MSc Sports Physiotherapy", specialization: "Musculoskeletal & Sports injuries", qualifications: ["BSc Physiotherapy - University of Ghana", "MSc Sports Physiotherapy - KNUST"], availability: [{ day: "Mon", start: "07:00", end: "16:00" }, { day: "Wed", start: "07:00", end: "16:00" }, { day: "Fri", start: "07:00", end: "14:00" }], remunerationMethod: "PER_SESSION", rate: 3000, email: "akosua.frimpong@gmrsphysio.com.gh", phone: "+233 27 555 3030" });
  const stYaw = await mkStaff("ST-0004", "Yaw", "Darko", "Physiotherapist", "PHYSIOTHERAPIST", { designation: "BSc Physiotherapy", specialization: "Neurological rehabilitation", qualifications: ["BSc Physiotherapy - University of Ghana"], remunerationMethod: "PER_PATIENT", rate: 15000, email: "yaw.darko@gmrsphysio.com.gh", phone: "+233 26 555 4040" });
  const stEfua = await mkStaff("ST-0005", "Efua", "Sarpong", "Physiotherapist", "PHYSIOTHERAPIST", { designation: "BSc Physiotherapy", specialization: "Post-surgical rehabilitation", qualifications: ["BSc Physiotherapy - GIMPA"], remunerationMethod: "FIXED", email: "efua.sarpong@gmrsphysio.com.gh", phone: "+233 24 555 5050" });
  const stDirector = await mkStaff("ST-0006", "Nana", "Adjei", "Clinic Director", "MANAGEMENT", { email: "nana.adjei@gmrsphysio.com.gh", phone: "+233 24 555 6060", department: "Management", employmentDate: d(-1200) });

  const pw = hashPassword("demo1234");
  const mkUser = (email: string, name: string, roleId: string, staffId: string) =>
    db.user.create({ data: { clinicId: clinic.id, email, passwordHash: pw, name, roleId, staffId } });
  const uAdmin = await mkUser("admin@gmrsphysio.com.gh", "Ama Boateng", roleAdmin.id, stAdmin.id);
  const uReception = await mkUser("reception@gmrsphysio.com.gh", "Kwame Owusu", roleReception.id, stReception.id);
  const uAkosua = await mkUser("akosua.frimpong@gmrsphysio.com.gh", "Akosua Frimpong", roleTherapist.id, stAkosua.id);
  const uYaw = await mkUser("yaw.darko@gmrsphysio.com.gh", "Yaw Darko", roleTherapist.id, stYaw.id);
  const uEfua = await mkUser("efua.sarpong@gmrsphysio.com.gh", "Efua Sarpong", roleTherapist.id, stEfua.id);
  const uDirector = await mkUser("management@gmrsphysio.com.gh", "Nana Adjei", roleManagement.id, stDirector.id);
  for (const [sId, uId] of [[stAdmin.id, uAdmin.id], [stReception.id, uReception.id], [stAkosua.id, uAkosua.id], [stYaw.id, uYaw.id], [stEfua.id, uEfua.id], [stDirector.id, uDirector.id]] as const) {
    await db.staffProfile.update({ where: { id: sId }, data: { userId: uId } });
  }

  // ---- Services ----
  const mkSvc = (name: string, description: string, priceCents: number, duration: number, category: string) =>
    db.service.create({ data: { clinicId: clinic.id, name, description, standardPriceCents: priceCents, defaultDurationMin: duration, category, arrangements: JSON.stringify(["PAYG", "PACKAGE", "INSURANCE"]) } });
  const sAssess = await mkSvc("Initial Assessment & Evaluation", "Comprehensive initial clinical assessment", 25000, 45, "ASSESSMENT");
  const sSession = await mkSvc("Physiotherapy Treatment Session", "Standard treatment session", 18000, 30, "TREATMENT");
  const sManual = await mkSvc("Manual Therapy", "Hands-on mobilisation and manipulation", 20000, 40, "TREATMENT");
  const sElectro = await mkSvc("Electrotherapy", "TENS / IFT / NMES application", 15000, 25, "TREATMENT");
  const sUltrasound = await mkSvc("Ultrasound Therapy", "Therapeutic ultrasound", 14000, 20, "TREATMENT");
  const sGait = await mkSvc("Gait & Balance Training", "Gait re-education and balance retraining", 17000, 35, "TREATMENT");
  const sSports = await mkSvc("Sports Rehabilitation", "Return-to-play rehab session", 22000, 50, "SPORTS");
  const sHEP = await mkSvc("Home Exercise Program Design", "Personalised exercise programme", 12000, 25, "PROGRAM");

  // ---- Packages ----
  const pkgBack = await db.packageDefinition.create({ data: { clinicId: clinic.id, name: "Back Relief Pack", description: "10 physiotherapy sessions for back and spinal conditions", sessions: 10, priceCents: 160000, validityDays: 90, serviceIds: JSON.stringify([sSession.id, sManual.id, sElectro.id]) } });
  const pkgSports = await db.packageDefinition.create({ data: { clinicId: clinic.id, name: "Sports Recovery Pack", description: "8 sessions for sports injury rehabilitation", sessions: 8, priceCents: 150000, validityDays: 60, serviceIds: JSON.stringify([sSports.id, sManual.id, sSession.id]) } });
  const pkgPost = await db.packageDefinition.create({ data: { clinicId: clinic.id, name: "Post-Surgical Rehab Pack", description: "12 sessions for post-operative rehabilitation", sessions: 12, priceCents: 210000, validityDays: 120, serviceIds: JSON.stringify([sSession.id, sGait.id, sElectro.id, sUltrasound.id]) } });

  // ---- Insurance providers + rates ----
  const provGlory = await db.insuranceProvider.create({ data: { clinicId: clinic.id, name: "Glory Health Insurance", code: "GHI", contactName: "Charles Agyemang", contactPhone: "+233 30 251 9000", email: "claims@gloryhealth.com.gh", billingArrangement: "DIRECT_BILLING", coveragePercent: 80 } });
  const provAcacia = await db.insuranceProvider.create({ data: { clinicId: clinic.id, name: "Acacia Health Plan", code: "ACACIA", contactName: "Vivian Mensah", contactPhone: "+233 30 964 2200", email: "provider@acaciahealth.gh", billingArrangement: "REIMBURSEMENT", coveragePercent: 70 } });
  const provMetro = await db.insuranceProvider.create({ data: { clinicId: clinic.id, name: "MetroCare Ghana", code: "MTRC", contactName: "Derek Quaye", contactPhone: "+233 30 812 3300", email: "claims@metrocare.gh", billingArrangement: "DIRECT_BILLING", coveragePercent: 85 } });

  for (const provider of [provGlory, provAcacia, provMetro]) {
    for (const s of [sAssess, sSession, sManual, sElectro, sGait, sSports]) {
      const factor = provider.code === "GHI" ? 0.9 : provider.code === "ACACIA" ? 0.85 : 0.95;
      await db.insuranceRate.create({
        data: {
          providerId: provider.id, serviceId: s.id,
          rateCents: Math.round(s.standardPriceCents * factor),
          coveragePercent: provider.code === "GHI" ? 80 : provider.code === "ACACIA" ? 70 : 85,
        },
      });
    }
  }

  // ---- Settings & counters ----
  for (const [key, value] of [
    ["reviewThreshold", "15"],
    ["appointmentSlotMin", "30"],
    ["workingHoursStart", "07:00"],
    ["workingHoursEnd", "19:00"],
    ["currency", "GHS"],
    ["timezone", "Africa/Accra"],
  ] as const) {
    await db.setting.create({ data: { clinicId: clinic.id, key, value } });
  }
  await db.counter.create({ data: { clinicId: clinic.id, key: "patientCode", value: 16 } });
  await db.counter.create({ data: { clinicId: clinic.id, key: "staffCode", value: 6 } });

  // ---- Patients ----
  let seq = 0;
  const patient = async (o: {
    first: string; middle?: string; last: string; dob: string; gender: string; phone: string;
    arrangement: string; therapistId?: string; daysAgo: number; status: string;
    email?: string; occupation?: string; nationality?: string; marital?: string; address?: string;
  }) => {
    seq++;
    const code = `PT-${String(seq).padStart(6, "0")}`;
    return db.patient.create({
      data: {
        clinicId: clinic.id, branchId: branchMain.id, patientCode: code,
        firstName: o.first, middleName: o.middle || null, lastName: o.last,
        dateOfBirth: new Date(o.dob), gender: o.gender, phone: o.phone,
        email: o.email || null, address: o.address || "Accra, Ghana",
        occupation: o.occupation || null, maritalStatus: o.marital || null, nationality: o.nationality || "Ghanaian",
        paymentArrangement: o.arrangement, currentStatus: o.status,
        assignedTherapistId: o.therapistId || null, registeredById: uReception.id,
        createdAt: d(-o.daysAgo), updatedAt: d(-o.daysAgo),
      },
    });
  };

  const p1 = await patient({ first: "Kofi", last: "Mensah", dob: "1985-04-12", gender: "MALE", phone: "+233 24 123 4567", arrangement: "PACKAGE", therapistId: stAkosua.id, daysAgo: 120, status: "IN_TREATMENT", email: "kofi.mensah@gmail.com", occupation: "Banker", marital: "MARRIED" });
  const p2 = await patient({ first: "Abena", last: "Osei", dob: "1992-09-30", gender: "FEMALE", phone: "+233 20 876 5432", arrangement: "INSURANCE", therapistId: stEfua.id, daysAgo: 21, status: "AWAITING_PLAN", email: "abena.osei@yahoo.com", occupation: "Teacher" });
  const p3 = await patient({ first: "Yaw", middle: "Kwabena", last: "Boateng", dob: "1978-01-05", gender: "MALE", phone: "+233 26 345 6789", arrangement: "PAYG", therapistId: stAkosua.id, daysAgo: 90, status: "ON_HOLD", occupation: "Civil Engineer" });
  const p4 = await patient({ first: "Akua", last: "Asantewaa", dob: "1958-07-19", gender: "FEMALE", phone: "+233 24 987 1234", arrangement: "PAYG", therapistId: stYaw.id, daysAgo: 150, status: "UNDER_REVIEW", occupation: "Retired Trader" });
  const p5 = await patient({ first: "Kwabena", last: "Frimpong", dob: "1966-11-02", gender: "MALE", phone: "+233 20 456 7890", arrangement: "PAYG", therapistId: stEfua.id, daysAgo: 75, status: "IN_TREATMENT", occupation: "Accountant" });
  const p6 = await patient({ first: "Efia", last: "Nyarko", dob: "1998-03-25", gender: "FEMALE", phone: "+233 27 654 3210", arrangement: "PACKAGE", therapistId: stAkosua.id, daysAgo: 70, status: "DISCHARGED", occupation: "Athlete", email: "efia.nyarko@outlook.com" });
  const p7 = await patient({ first: "Nana", middle: "Yaw", last: "Amponsah", dob: "1988-12-14", gender: "MALE", phone: "+233 24 567 8901", arrangement: "INSURANCE", therapistId: stAkosua.id, daysAgo: 40, status: "IN_TREATMENT", occupation: "Sales Manager" });
  const p8 = await patient({ first: "Adwoa", last: "Agyeman", dob: "2001-06-08", gender: "FEMALE", phone: "+233 55 111 2233", arrangement: "PAYG", daysAgo: 3, status: "AWAITING_ASSESSMENT", occupation: "Student" });
  const p9 = await patient({ first: "Kwesi", last: "Nyantakyi", dob: "1974-08-21", gender: "MALE", phone: "+233 24 222 3344", arrangement: "PAYG", daysAgo: 2, status: "NO_EPISODE", occupation: "Driver" });
  const p10 = await patient({ first: "Ama", last: "Darkoa", dob: "1980-02-17", gender: "FEMALE", phone: "+233 20 333 4455", arrangement: "PACKAGE", therapistId: stEfua.id, daysAgo: 65, status: "IN_TREATMENT", occupation: "Nurse" });
  const p11 = await patient({ first: "Kojo", last: "Antwi", dob: "1952-05-11", gender: "MALE", phone: "+233 26 444 5566", arrangement: "PAYG", therapistId: stYaw.id, daysAgo: 55, status: "IN_TREATMENT", occupation: "Retired" });
  const p12 = await patient({ first: "Esi", last: "Awuni", dob: "1983-10-03", gender: "FEMALE", phone: "+233 55 555 6677", arrangement: "INSURANCE", therapistId: stAkosua.id, daysAgo: 33, status: "IN_TREATMENT", occupation: "Software Developer", email: "esi.awuni@gmail.com" });
  const p13 = await patient({ first: "Fifi", last: "Baffour", dob: "1990-01-27", gender: "MALE", phone: "+233 24 666 7788", arrangement: "PAYG", daysAgo: 48, status: "NO_EPISODE", occupation: "Graphic Designer" });
  const p14 = await patient({ first: "Maame", last: "Gyamfia", dob: "1969-09-09", gender: "FEMALE", phone: "+233 20 777 8899", arrangement: "PAYG", therapistId: stYaw.id, daysAgo: 7, status: "AWAITING_ASSESSMENT", occupation: "Trader" });
  const p15 = await patient({ first: "Kweku", last: "Asamoah", dob: "1949-03-15", gender: "MALE", phone: "+233 26 888 9900", arrangement: "PACKAGE", therapistId: stEfua.id, daysAgo: 58, status: "IN_TREATMENT", occupation: "Retired Teacher" });
  const p16 = await patient({ first: "Josephine", last: "Lartey", dob: "1995-12-01", gender: "FEMALE", phone: "+233 55 999 0011", arrangement: "PAYG", daysAgo: 5, status: "NO_EPISODE", email: "j.lartey@gmail.com", occupation: "Marketing Officer" });

  // Emergency contacts
  const ec = (patientId: string, fullName: string, relationship: string, phone: string, kin = false) =>
    db.emergencyContact.create({ data: { patientId, fullName, relationship, phone, isNextOfKin: kin } });
  await ec(p1.id, "Adjoa Mensah", "Spouse", "+233 24 123 0000", true);
  await ec(p2.id, "Grace Osei", "Mother", "+233 20 876 0000", true);
  await ec(p4.id, "Yaw Asantewaa", "Son", "+233 24 987 0000", true);
  await ec(p11.id, "Rose Antwi", "Daughter", "+233 26 444 0000", true);

  // Medical history
  const mh = (patientId: string, type: string, name: string, details?: string) =>
    db.medicalHistoryEntry.create({ data: { patientId, type, name, details } });
  await mh(p1.id, "CONDITION", "Hypertension", "Controlled with medication");
  await mh(p1.id, "MEDICATION", "Amlodipine 5mg", "Once daily");
  await mh(p4.id, "CONDITION", "Hypertension", "Diagnosed 2018");
  await mh(p4.id, "CONDITION", "Type 2 Diabetes", "On metformin");
  await mh(p4.id, "MEDICATION", "Metformin 500mg", "Twice daily");
  await mh(p11.id, "SURGERY", "Total Knee Replacement (Right)", "December last year at Nyaho Medical Centre");
  await mh(p11.id, "CONDITION", "Osteoarthritis");
  await mh(p13.id, "ALLERGY", "Penicillin", "Rash and swelling");
  await mh(p2.id, "INJURY", "ACL tear (right knee)", "Football match injury 3 months ago");

  // Consents
  for (const p of [p1, p2, p3, p4, p5, p6, p7, p10, p11, p12, p15]) {
    await db.patientConsent.create({ data: { patientId: p.id, treatmentConsent: true, dataConsent: true, signatureName: `${p.firstName} ${p.lastName}`, consentDate: d(-120) } });
  }

  // Referrals
  const ref = (patientId: string, source: string, name?: string, contact?: string, daysAgo = 30) =>
    db.patientReferral.create({ data: { patientId, source, referrerName: name, referrerContact: contact, referralDate: d(-daysAgo) } });
  await ref(p1.id, "DOCTOR", "Dr. Sekyi Brown", "Nyaho Medical Centre +233 30 274 1000", 120);
  await ref(p2.id, "HOSPITAL", "37 Military Hospital Orthopaedics", "+233 30 274 1100", 21);
  await ref(p4.id, "DOCTOR", "Dr. Nkrumah", "Trust Hospital +233 30 274 1200", 150);
  await ref(p9.id, "WALK_IN", undefined, undefined, 2);
  await ref(p16.id, "DOCTOR", "Dr. Forson", "Lekma Hospital", 5);
  await ref(p6.id, "PROFESSIONAL", "Coach Adjei", "Accra Hearts of Oak FC", 70);

  // ================= EPISODES =================
  let epSeq = 0;
  const episode = async (o: { patientId: string; title: string; status: string; therapistId: string; daysAgo: number; closedAfterDays?: number; totalSessions?: number; sinceReview?: number; reviewDue?: boolean; holdHistory?: unknown[] }) => {
    epSeq++;
    return db.treatmentEpisode.create({
      data: {
        clinicId: clinic.id, patientId: o.patientId, episodeNumber: epSeq,
        title: o.title, status: o.status, therapistId: o.therapistId,
        openedDate: d(-o.daysAgo), closedDate: o.closedAfterDays ? d(-o.closedAfterDays) : null,
        totalCompletedSessions: o.totalSessions || 0, sessionsSinceReview: o.sinceReview || 0,
        reviewThreshold: 15, reviewDue: o.reviewDue || false,
        holdHistory: JSON.stringify(o.holdHistory || []),
        branchId: branchMain.id,
      },
    });
  };

  const e1 = await episode({ patientId: p1.id, title: "Chronic lower back pain (L4-L5)", status: "ACTIVE_TREATMENT", therapistId: stAkosua.id, daysAgo: 115, totalSessions: 11, sinceReview: 8 });
  const e2 = await episode({ patientId: p2.id, title: "ACL reconstruction rehabilitation (right knee)", status: "AWAITING_PLAN", therapistId: stEfua.id, daysAgo: 20 });
  const e3 = await episode({ patientId: p3.id, title: "Cervical strain — whiplash injury", status: "ON_HOLD", therapistId: stAkosua.id, daysAgo: 88, totalSessions: 6, sinceReview: 6, holdHistory: [{ date: d(-20).toISOString(), reason: "Patient travelling for work — extended site assignment in Takoradi", notes: "To resume on return" }] });
  const e4 = await episode({ patientId: p4.id, title: "Post-stroke rehabilitation — left hemiplegia", status: "ACTIVE_TREATMENT", therapistId: stYaw.id, daysAgo: 145, totalSessions: 13, sinceReview: 15, reviewDue: true });
  const e5 = await episode({ patientId: p5.id, title: "Adhesive capsulitis (frozen shoulder) — right", status: "UNDER_REVIEW", therapistId: stEfua.id, daysAgo: 72, totalSessions: 8, sinceReview: 1 });
  const e6 = await episode({ patientId: p6.id, title: "Grade 2 hamstring strain — left", status: "DISCHARGED", therapistId: stAkosua.id, daysAgo: 68, closedAfterDays: 12, totalSessions: 8, sinceReview: 3 });
  const e7 = await episode({ patientId: p7.id, title: "Plantar fasciitis — right foot", status: "ACTIVE_TREATMENT", therapistId: stAkosua.id, daysAgo: 38, totalSessions: 5, sinceReview: 5 });
  const e8 = await episode({ patientId: p8.id, title: "Knee pain — suspected patellofemoral syndrome", status: "AWAITING_ASSESSMENT", therapistId: stEfua.id, daysAgo: 2 });
  const e9 = await episode({ patientId: p10.id, title: "Subacromial impingement — right shoulder", status: "ACTIVE_TREATMENT", therapistId: stEfua.id, daysAgo: 60, totalSessions: 9, sinceReview: 9 });
  const e10 = await episode({ patientId: p11.id, title: "Post total-knee-replacement rehabilitation", status: "ACTIVE_TREATMENT", therapistId: stYaw.id, daysAgo: 50, totalSessions: 12, sinceReview: 12 });
  const e11 = await episode({ patientId: p12.id, title: "Lumbar radiculopathy (sciatica) — left", status: "ACTIVE_TREATMENT", therapistId: stAkosua.id, daysAgo: 30, totalSessions: 6, sinceReview: 6 });
  const e12 = await episode({ patientId: p13.id, title: "Lateral epicondylitis (tennis elbow) — right", status: "DISCONTINUED", therapistId: stAkosua.id, daysAgo: 45, closedAfterDays: 18, totalSessions: 4, sinceReview: 4 });
  const e13 = await episode({ patientId: p14.id, title: "Mechanical low back pain", status: "AWAITING_ASSESSMENT", therapistId: stYaw.id, daysAgo: 5 });
  const e14 = await episode({ patientId: p15.id, title: "Post total-knee-replacement rehabilitation (left)", status: "ACTIVE_TREATMENT", therapistId: stEfua.id, daysAgo: 55, totalSessions: 6, sinceReview: 11 });

  // ================= ASSESSMENTS =================
  const assessment = async (o: {
    episodeId: string; therapistId: string; daysAgo: number; status?: string;
    complaint: string; bodyPart: string; side: string; duration: string; onset: string; cause: string;
    agg?: string; rel?: string; painCurrent?: number; painWorst?: number; painLowest?: number;
    rom?: { bodyPart: string; movement: string; side: string; active: number; passive: number; normal: number }[];
    strength?: { bodyPart: string; muscleGroup: string; side: string; grade: number }[];
    functional?: { activity: string; difficulty: number }[];
    vitals?: { bloodPressure?: string; heartRate?: number; temperature?: number; weightKg?: number; heightCm?: number; oxygenSaturation?: number };
    findings: string; impairments: string; impression: string;
  }) =>
    db.assessment.create({
      data: {
        clinicId: clinic.id, episodeId: o.episodeId, therapistId: o.therapistId,
        assessmentDate: d(-o.daysAgo), status: o.status || "COMPLETED",
        primaryComplaint: o.complaint, bodyPart: o.bodyPart, affectedSide: o.side,
        duration: o.duration, onset: o.onset, cause: o.cause,
        aggravating: o.agg, relieving: o.rel,
        painCurrent: o.painCurrent, painWorst: o.painWorst, painLowest: o.painLowest,
        painLocation: o.bodyPart, painType: "Aching", painFrequency: "Daily",
        posture: "Slight antalgic posture", swelling: "None observed", deformity: "None", skinCondition: "Intact",
        muscleWasting: "None", gait: "Antalgic gait noted",
        bloodPressure: o.vitals?.bloodPressure || null, heartRate: o.vitals?.heartRate || null,
        temperature: o.vitals?.temperature || null, weightKg: o.vitals?.weightKg || null,
        heightCm: o.vitals?.heightCm || null, oxygenSaturation: o.vitals?.oxygenSaturation || null,
        clinicalFindings: o.findings, impairments: o.impairments,
        functionalLimitations: "Difficulty with daily activities involving the affected region",
        clinicalImpression: o.impression, precautions: "Avoid aggressive stretching in acute phase",
        therapistSignature: "Signed electronically", completedAt: d(-o.daysAgo + 1),
        romMeasurements: { create: (o.rom || []).map((r) => ({ bodyPart: r.bodyPart, movement: r.movement, side: r.side, activeRom: r.active, passiveRom: r.passive, normalValue: r.normal })) },
        strengthMeasurements: { create: (o.strength || []).map((s) => ({ bodyPart: s.bodyPart, muscleGroup: s.muscleGroup, side: s.side, grade: s.grade })) },
        functionalItems: { create: (o.functional || []).map((f) => ({ activity: f.activity, difficulty: f.difficulty })) },
      },
    });

  await assessment({
    episodeId: e1.id, therapistId: stAkosua.id, daysAgo: 112,
    complaint: "Persistent lower back pain radiating to left buttock", bodyPart: "Lumbar spine", side: "LEFT",
    duration: "4 months", onset: "GRADUAL", cause: "Prolonged sitting and frequent heavy lifting at work",
    agg: "Prolonged sitting, bending forward, lifting", rel: "Lying down, standing, brief heat",
    painCurrent: 7, painWorst: 9, painLowest: 4,
    rom: [
      { bodyPart: "Lumbar spine", movement: "Flexion", side: "N/A", active: 40, passive: 45, normal: 60 },
      { bodyPart: "Lumbar spine", movement: "Extension", side: "N/A", active: 15, passive: 18, normal: 25 },
      { bodyPart: "Lumbar spine", movement: "Left lateral flexion", side: "LEFT", active: 15, passive: 20, normal: 30 },
    ],
    strength: [
      { bodyPart: "Lumbar spine", muscleGroup: "Core stabilisers", side: "N/A", grade: 3 },
      { bodyPart: "Hip", muscleGroup: "Gluteus medius", side: "LEFT", grade: 4 },
    ],
    functional: [{ activity: "Sitting", difficulty: 3 }, { activity: "Bending", difficulty: 4 }, { activity: "Walking", difficulty: 1 }, { activity: "Sleeping", difficulty: 2 }],
    vitals: { bloodPressure: "128/84", heartRate: 72, weightKg: 84, heightCm: 178 },
    findings: "Reduced lumbar flexion with pain at end range. Tenderness over L4-L5. SLR positive at 50 degrees left. Pain reproduction with central PAIVM at L4/L5.",
    impairments: "Limited lumbar ROM, core weakness, pain",
    impression: "L4-L5 discogenic pain with left radiculopathy features",
  });

  await assessment({
    episodeId: e2.id, therapistId: stEfua.id, daysAgo: 18,
    complaint: "Post-surgical right knee stiffness and weakness", bodyPart: "Knee", side: "RIGHT",
    duration: "3 weeks post-op", onset: "SUDDEN", cause: "ACL reconstruction surgery",
    agg: "Fully extending knee, stairs", rel: "Rest, ice, elevation",
    painCurrent: 4, painWorst: 8, painLowest: 2,
    rom: [
      { bodyPart: "Knee", movement: "Flexion", side: "RIGHT", active: 75, passive: 90, normal: 135 },
      { bodyPart: "Knee", movement: "Extension", side: "RIGHT", active: -5, passive: 0, normal: 0 },
    ],
    strength: [{ bodyPart: "Knee", muscleGroup: "Quadriceps", side: "RIGHT", grade: 3 }, { bodyPart: "Hip", muscleGroup: "Gluteus maximus", side: "RIGHT", grade: 4 }],
    functional: [{ activity: "Walking", difficulty: 2 }, { activity: "Climbing stairs", difficulty: 3 }, { activity: "Sitting", difficulty: 1 }],
    vitals: { bloodPressure: "112/70", heartRate: 68, weightKg: 62, heightCm: 166 },
    findings: "Post-op week 3. Knee flexion 75 degrees active. Mild effusion. Quadriceps lag present. Surgical wound healed.",
    impairments: "Knee stiffness, quadriceps weakness, mild effusion",
    impression: "Normal early post-ACL-reconstruction presentation — requires structured progressive rehab plan",
  });

  await assessment({
    episodeId: e3.id, therapistId: stAkosua.id, daysAgo: 85,
    complaint: "Neck pain and stiffness following road traffic accident", bodyPart: "Cervical spine", side: "BILATERAL",
    duration: "2 weeks", onset: "SUDDEN", cause: "Road traffic accident (rear-end collision)",
    agg: "Sitting at desk, driving", rel: "Rest, heat",
    painCurrent: 6, painWorst: 8, painLowest: 3,
    rom: [
      { bodyPart: "Cervical spine", movement: "Rotation left", side: "LEFT", active: 35, passive: 45, normal: 80 },
      { bodyPart: "Cervical spine", movement: "Rotation right", side: "RIGHT", active: 40, passive: 50, normal: 80 },
    ],
    strength: [{ bodyPart: "Cervical spine", muscleGroup: "Cervical extensors", side: "N/A", grade: 4 }],
    functional: [{ activity: "Sleeping", difficulty: 2 }, { activity: "Sitting", difficulty: 2 }],
    vitals: { bloodPressure: "135/88", heartRate: 80, weightKg: 91, heightCm: 182 },
    findings: "Reduced cervical rotation bilaterally, upper trapezius spasm. No neurological deficits. WAD II classification.",
    impairments: "Cervical ROM restriction, muscle spasm",
    impression: "Whiplash-associated disorder II",
  });

  await assessment({
    episodeId: e4.id, therapistId: stYaw.id, daysAgo: 140,
    complaint: "Left-sided weakness and difficulty walking after stroke", bodyPart: "General", side: "LEFT",
    duration: "5 months", onset: "SUDDEN", cause: "Ischaemic stroke",
    agg: "Fatigue", rel: "Rest",
    painCurrent: 2, painWorst: 3, painLowest: 0,
    rom: [{ bodyPart: "Shoulder", movement: "Flexion", side: "LEFT", active: 90, passive: 120, normal: 180 }, { bodyPart: "Knee", movement: "Flexion", side: "LEFT", active: 100, passive: 120, normal: 135 }],
    strength: [
      { bodyPart: "Shoulder", muscleGroup: "Deltoid", side: "LEFT", grade: 2 },
      { bodyPart: "Hip", muscleGroup: "Iliopsoas", side: "LEFT", grade: 3 },
      { bodyPart: "Knee", muscleGroup: "Quadriceps", side: "LEFT", grade: 3 },
    ],
    functional: [{ activity: "Walking", difficulty: 3 }, { activity: "Standing", difficulty: 3 }, { activity: "Dressing", difficulty: 3 }, { activity: "Bathing", difficulty: 4 }],
    vitals: { bloodPressure: "146/92", heartRate: 76, weightKg: 68, heightCm: 158 },
    findings: "Left spastic hemiplegia. Berg Balance Score 32/56. Ambulates 20m with tripod stick and minimal supervision.",
    impairments: "Left hemiparesis, balance deficit, spasticity",
    impression: "Post-stroke left hemiplegia — continues outpatient rehabilitation",
  });

  await assessment({
    episodeId: e5.id, therapistId: stEfua.id, daysAgo: 70,
    complaint: "Right shoulder pain and progressive stiffness", bodyPart: "Shoulder", side: "RIGHT",
    duration: "3 months", onset: "GRADUAL", cause: "Insidious onset, possibly related to diabetes",
    agg: "Reaching overhead, lying on right side", rel: "Warm showers",
    painCurrent: 6, painWorst: 8, painLowest: 3,
    rom: [
      { bodyPart: "Shoulder", movement: "Flexion", side: "RIGHT", active: 100, passive: 120, normal: 180 },
      { bodyPart: "Shoulder", movement: "External rotation", side: "RIGHT", active: 25, passive: 35, normal: 90 },
    ],
    strength: [{ bodyPart: "Shoulder", muscleGroup: "Rotator cuff", side: "RIGHT", grade: 4 }],
    functional: [{ activity: "Dressing", difficulty: 3 }, { activity: "Sleeping", difficulty: 3 }, { activity: "Lifting", difficulty: 3 }],
    vitals: { bloodPressure: "124/78", heartRate: 70, weightKg: 74, heightCm: 170 },
    findings: "Capsular pattern restriction of glenohumeral joint. Decreased scapulohumeral rhythm. No impingement signs at rest.",
    impairments: "Shoulder stiffness, pain at end-range",
    impression: "Adhesive capsulitis — freezing/early frozen stage",
  });

  await assessment({
    episodeId: e7.id, therapistId: stAkosua.id, daysAgo: 36,
    complaint: "Heel pain worse in the morning", bodyPart: "Ankle/Foot", side: "RIGHT",
    duration: "6 weeks", onset: "GRADUAL", cause: "Increased running volume",
    agg: "First steps in morning, prolonged standing", rel: "Rest, ice, stretching",
    painCurrent: 5, painWorst: 7, painLowest: 2,
    rom: [{ bodyPart: "Ankle/Foot", movement: "Dorsiflexion", side: "RIGHT", active: 10, passive: 15, normal: 20 }],
    strength: [{ bodyPart: "Ankle/Foot", muscleGroup: "Plantar fascia/calf complex", side: "RIGHT", grade: 4 }],
    functional: [{ activity: "Walking", difficulty: 2 }, { activity: "Standing", difficulty: 2 }, { activity: "Running", difficulty: 4 }],
    vitals: { bloodPressure: "118/76", heartRate: 64, weightKg: 77, heightCm: 175 },
    findings: "Tenderness at medial calcaneal tubercle. Positive windlass test. Tight gastrocnemius-soleus complex.",
    impairments: "Plantar heel pain, calf tightness",
    impression: "Plantar fasciitis, right",
  });

  await assessment({
    episodeId: e10.id, therapistId: stYaw.id, daysAgo: 48,
    complaint: "Rehabilitation after right total knee replacement", bodyPart: "Knee", side: "RIGHT",
    duration: "6 weeks post-op", onset: "SUDDEN", cause: "Total knee replacement surgery",
    agg: "Stairs, kneeling", rel: "Rest, analgesia",
    painCurrent: 3, painWorst: 7, painLowest: 2,
    rom: [{ bodyPart: "Knee", movement: "Flexion", side: "RIGHT", active: 95, passive: 110, normal: 135 }],
    strength: [{ bodyPart: "Knee", muscleGroup: "Quadriceps", side: "RIGHT", grade: 4 }],
    functional: [{ activity: "Walking", difficulty: 2 }, { activity: "Climbing stairs", difficulty: 3 }],
    vitals: { bloodPressure: "130/80", heartRate: 72, weightKg: 88, heightCm: 174 },
    findings: "Week 6 post TKA. Flexion 95 degrees, extension lag 5 degrees. Scar well healed. Uses walking stick outdoors.",
    impairments: "Knee ROM restriction, quadriceps weakness",
    impression: "Normal post-TKA recovery trajectory at week 6",
  });

  // ================= DIAGNOSES =================
  const diag = (o: { episodeId: string; therapistId: string; title: string; category: string; bodyPart: string; side: string; severity: string; explanation: string; provisional?: boolean; daysAgo: number }) =>
    db.diagnosis.create({ data: { clinicId: clinic.id, episodeId: o.episodeId, title: o.title, category: o.category, bodyPart: o.bodyPart, affectedSide: o.side, severity: o.severity, explanation: o.explanation, provisional: o.provisional || false, diagnosisDate: d(-o.daysAgo), therapistId: o.therapistId, status: "ACTIVE" } });

  await diag({ episodeId: e1.id, therapistId: stAkosua.id, title: "Lumbar disc herniation with radiculopathy (L4-L5, left)", category: "MUSCULOSKELETAL", bodyPart: "Lumbar spine", side: "LEFT", severity: "MODERATE", explanation: "Clinical presentation and physical examination consistent with L4-L5 discogenic pain with left radiculopathy. MRI recommended if symptoms persist beyond 8 weeks of conservative care.", daysAgo: 112 });
  await diag({ episodeId: e2.id, therapistId: stEfua.id, title: "Post-ACL-reconstruction knee dysfunction", category: "POST_SURGICAL", bodyPart: "Knee", side: "RIGHT", severity: "MODERATE", explanation: "Standard early post-operative presentation following ACL reconstruction with hamstring graft.", daysAgo: 18 });
  await diag({ episodeId: e3.id, therapistId: stAkosua.id, title: "Whiplash-associated disorder II", category: "MUSCULOSKELETAL", bodyPart: "Cervical spine", side: "BILATERAL", severity: "MILD", explanation: "Neck complaint with musculoskeletal findings and reduced ROM, no neurological signs.", daysAgo: 85 });
  await diag({ episodeId: e4.id, therapistId: stYaw.id, title: "Post-stroke left hemiplegia", category: "NEUROLOGICAL", bodyPart: "General", side: "LEFT", severity: "SEVERE", explanation: "Ischaemic stroke with residual left-sided hemiparesis and balance impairment.", daysAgo: 140 });
  await diag({ episodeId: e5.id, therapistId: stEfua.id, title: "Adhesive capsulitis (frozen shoulder) — right", category: "MUSCULOSKELETAL", bodyPart: "Shoulder", side: "RIGHT", severity: "MODERATE", explanation: "Capsular restriction pattern with progressive stiffness, consistent with frozen shoulder in freezing stage.", daysAgo: 70 });
  await diag({ episodeId: e6.id, therapistId: stAkosua.id, title: "Grade 2 hamstring strain", category: "SPORTS_INJURY", bodyPart: "Hip", side: "LEFT", severity: "MODERATE", explanation: "Partial hamstring tear confirmed by clinical assessment; MRI showed grade 2 injury of biceps femoris.", daysAgo: 66 });
  await diag({ episodeId: e7.id, therapistId: stAkosua.id, title: "Plantar fasciitis", category: "MUSCULOSKELETAL", bodyPart: "Ankle/Foot", side: "RIGHT", severity: "MILD", explanation: "Classical presentation with medial calcaneal tenderness and positive windlass test.", daysAgo: 36 });
  await diag({ episodeId: e9.id, therapistId: stEfua.id, title: "Subacromial impingement syndrome", category: "MUSCULOSKELETAL", bodyPart: "Shoulder", side: "RIGHT", severity: "MILD", explanation: "Painful arc and positive Neer/Hawkins tests. Responsive to conservative management so far.", provisional: true, daysAgo: 58 });
  await diag({ episodeId: e10.id, therapistId: stYaw.id, title: "Post total knee arthroplasty rehabilitation", category: "POST_SURGICAL", bodyPart: "Knee", side: "RIGHT", severity: "MODERATE", explanation: "Status post elective TKA for primary osteoarthritis.", daysAgo: 48 });
  await diag({ episodeId: e11.id, therapistId: stAkosua.id, title: "Lumbar radiculopathy (sciatica)", category: "MUSCULOSKELETAL", bodyPart: "Lumbar spine", side: "LEFT", severity: "MODERATE", explanation: "Dermatomal pain distribution with positive SLR; MRI referral pending.", daysAgo: 30 });
  await diag({ episodeId: e12.id, therapistId: stAkosua.id, title: "Lateral epicondylitis (tennis elbow)", category: "MUSCULOSKELETAL", bodyPart: "Elbow", side: "RIGHT", severity: "MILD", explanation: "Localised tenderness over lateral epicondyle with resisted wrist extension pain.", daysAgo: 44 });
  await diag({ episodeId: e14.id, therapistId: stEfua.id, title: "Post total knee arthroplasty rehabilitation (left)", category: "POST_SURGICAL", bodyPart: "Knee", side: "LEFT", severity: "MODERATE", explanation: "Status post elective TKA.", daysAgo: 53 });

  // ================= TREATMENT PLANS =================
  const plan = async (o: {
    episodeId: string; version: number; status: string; createdById: string;
    perWeek: number; totalSessions: number; durationMin: number; startDaysAgo: number; endInDays: number;
    objectives: { description: string; baseline: string; target: string; unit: string; priority: string }[];
    interventions: { name: string; description: string; frequency: string; duration: string; instructions: string }[];
    milestones?: { description: string; inDays: number; status: string }[];
    revisedFromId?: string; activated?: boolean;
  }) =>
    db.treatmentPlan.create({
      data: {
        clinicId: clinic.id, episodeId: o.episodeId, version: o.version, status: o.status,
        sessionsPerWeek: o.perWeek, expectedTotalSessions: o.totalSessions,
        sessionDurationMin: o.durationMin, startDate: d(-o.startDaysAgo), endDate: d(o.endInDays),
        reviewThresholdSessions: 15,
        contraindications: "No high-velocity manipulation in acute inflammation",
        restrictions: "Avoid prolonged sitting > 45 minutes initially",
        activitiesToAvoid: "Heavy lifting (>10kg) until cleared",
        specialPrecautions: "Monitor pain response; stop if symptoms peripheralise",
        patientRecommendations: "Walk 10 minutes 2-3x daily; apply heat before exercises",
        createdById: o.createdById,
        activatedAt: o.activated === false ? null : d(-o.startDaysAgo),
        revisedFromId: o.revisedFromId || null,
        objectives: { create: o.objectives.map((ob) => ({ description: ob.description, baseline: ob.baseline, target: ob.target, unit: ob.unit, priority: ob.priority, expectedDate: d(o.endInDays), status: "PENDING" })) },
        milestones: { create: (o.milestones || []).map((mm) => ({ description: mm.description, expectedDate: d(mm.inDays), status: mm.status })) },
        interventions: { create: o.interventions.map((iv) => ({ name: iv.name, description: iv.description, frequency: iv.frequency, duration: iv.duration, instructions: iv.instructions })) },
      },
    });

  const plan1 = await plan({
    episodeId: e1.id, version: 1, status: "ACTIVE", createdById: uAkosua.id,
    perWeek: 3, totalSessions: 24, durationMin: 45, startDaysAgo: 110, endInDays: 40,
    objectives: [
      { description: "Reduce pain from 7/10 to 3/10", baseline: "7", target: "3", unit: "pain score (0-10)", priority: "HIGH" },
      { description: "Improve lumbar flexion from 40° to 55°", baseline: "40", target: "55", unit: "degrees", priority: "HIGH" },
      { description: "Improve core stability (hold side-plank 30s each side)", baseline: "8s", target: "30s", unit: "seconds", priority: "MEDIUM" },
    ],
    interventions: [
      { name: "Manual therapy", description: "Lumbar PAIVM mobilisations grade III", frequency: "2x/week", duration: "4 weeks", instructions: "Grade III oscillations at L4/L5" },
      { name: "Therapeutic exercises", description: "Core stabilisation programme", frequency: "3x/week", duration: "8 weeks", instructions: "Dead bug, bird-dog, side plank progressions" },
      { name: "Stretching", description: "Hip flexor and hamstring flexibility", frequency: "Daily", duration: "6 weeks", instructions: "Hold 30s x 3 each" },
      { name: "Electrotherapy", description: "TENS for pain modulation", frequency: "Each visit", duration: "As needed", instructions: "20 min TENS 80-100Hz" },
    ],
    milestones: [
      { description: "Pain below 5/10 with daily activities", inDays: 30, status: "IN_PROGRESS" },
      { description: "Independent with home programme", inDays: 45, status: "ACHIEVED" },
    ],
  });

  const plan5 = await plan({
    episodeId: e5.id, version: 1, status: "UNDER_REVIEW", createdById: uEfua.id,
    perWeek: 2, totalSessions: 20, durationMin: 40, startDaysAgo: 68, endInDays: 30,
    objectives: [
      { description: "Improve shoulder flexion from 100° to 150°", baseline: "100", target: "150", unit: "degrees", priority: "HIGH" },
      { description: "Improve external rotation from 25° to 60°", baseline: "25", target: "60", unit: "degrees", priority: "HIGH" },
      { description: "Reduce night pain from 6/10 to 2/10", baseline: "6", target: "2", unit: "pain score (0-10)", priority: "MEDIUM" },
    ],
    interventions: [
      { name: "Manual therapy", description: "Glenohumeral mobilisations grades III-IV", frequency: "2x/week", duration: "8 weeks", instructions: "Caudal glide and posterior glide progressions" },
      { name: "Stretching", description: "Capsular stretches + pendulum exercises", frequency: "Daily", duration: "8 weeks", instructions: "Low-load prolonged stretch 3x30s" },
      { name: "Strengthening", description: "Rotator cuff and scapular stabilisers", frequency: "3x/week", duration: "8 weeks", instructions: "Isometrics then theraband progressions" },
    ],
    milestones: [{ description: "Sleep through night without pain", inDays: 40, status: "IN_PROGRESS" }],
  });

  const plan9v1 = await plan({
    episodeId: e9.id, version: 1, status: "REVISED", createdById: uEfua.id,
    perWeek: 2, totalSessions: 16, durationMin: 40, startDaysAgo: 58, endInDays: -10,
    objectives: [
      { description: "Reduce pain from 6/10 to 2/10", baseline: "6", target: "2", unit: "pain score (0-10)", priority: "HIGH" },
      { description: "Pain-free overhead reach", baseline: "Pain at 120°", target: "Pain-free to 180°", unit: "qualitative", priority: "HIGH" },
    ],
    interventions: [
      { name: "Manual therapy", description: "Subacromial mobilisations", frequency: "2x/week", duration: "6 weeks", instructions: "" },
      { name: "Strengthening", description: "Rotator cuff loading", frequency: "3x/week", duration: "8 weeks", instructions: "" },
    ],
  });
  const plan9v2 = await plan({
    episodeId: e9.id, version: 2, status: "ACTIVE", createdById: uEfua.id, revisedFromId: plan9v1.id,
    perWeek: 3, totalSessions: 18, durationMin: 45, startDaysAgo: 14, endInDays: 50,
    objectives: [
      { description: "Reduce pain from 4/10 to 1/10", baseline: "4", target: "1", unit: "pain score (0-10)", priority: "HIGH" },
      { description: "Full overhead reach without pain", baseline: "Pain at 140°", target: "Pain-free to 180°", unit: "qualitative", priority: "HIGH" },
      { description: "Return to full nursing duties", baseline: "Modified duties", target: "Full duties", unit: "work capacity", priority: "MEDIUM" },
    ],
    interventions: [
      { name: "Manual therapy", description: "Subacromial and scapulothoracic mobilisations", frequency: "2x/week", duration: "6 weeks", instructions: "" },
      { name: "Strengthening", description: "Eccentric rotator cuff loading + scapular control", frequency: "3x/week", duration: "8 weeks", instructions: "" },
      { name: "Postural correction", description: "Ergonomic and postural retraining", frequency: "Ongoing", duration: "8 weeks", instructions: "" },
    ],
    milestones: [{ description: "Pain-free activities of daily living", inDays: 30, status: "IN_PROGRESS" }],
  });

  const plan10 = await plan({
    episodeId: e10.id, version: 1, status: "ACTIVE", createdById: uYaw.id,
    perWeek: 3, totalSessions: 20, durationMin: 45, startDaysAgo: 46, endInDays: 35,
    objectives: [
      { description: "Achieve knee flexion 120°", baseline: "95", target: "120", unit: "degrees", priority: "HIGH" },
      { description: "Independent walking without stick for 500m", baseline: "200m with stick", target: "500m unaided", unit: "metres", priority: "HIGH" },
      { description: "Quadriceps strength 4/5", baseline: "3", target: "4", unit: "MRC grade", priority: "MEDIUM" },
    ],
    interventions: [
      { name: "Therapeutic exercises", description: "Progressive knee strengthening", frequency: "3x/week", duration: "10 weeks", instructions: "Closed-chain progression" },
      { name: "Gait training", description: "Gait re-education, wean off walking stick", frequency: "2x/week", duration: "6 weeks", instructions: "" },
      { name: "Balance training", description: "Single-leg stance progression", frequency: "3x/week", duration: "8 weeks", instructions: "" },
    ],
    milestones: [{ description: "Walk 200m without walking aid", inDays: 30, status: "IN_PROGRESS" }],
  });

  const plan4 = await plan({
    episodeId: e4.id, version: 1, status: "ACTIVE", createdById: uYaw.id,
    perWeek: 3, totalSessions: 36, durationMin: 60, startDaysAgo: 138, endInDays: 75,
    objectives: [
      { description: "Improve walking independence to 50m with quad stick", baseline: "10m with aid", target: "50m", unit: "metres", priority: "HIGH" },
      { description: "Improve left shoulder flexion from 90° to 130°", baseline: "90", target: "130", unit: "degrees", priority: "MEDIUM" },
      { description: "Improve Berg Balance Score from 32 to 42", baseline: "32", target: "42", unit: "points", priority: "HIGH" },
    ],
    interventions: [
      { name: "Gait training", description: "Task-specific gait retraining", frequency: "3x/week", duration: "12 weeks", instructions: "" },
      { name: "Balance training", description: "Progressive balance challenges", frequency: "3x/week", duration: "12 weeks", instructions: "" },
      { name: "Strengthening", description: "Affected-side progressive resistance", frequency: "3x/week", duration: "12 weeks", instructions: "" },
    ],
    milestones: [{ description: "Transfer independently", inDays: 60, status: "ACHIEVED" }],
  });

  const plan11 = await plan({
    episodeId: e11.id, version: 1, status: "ACTIVE", createdById: uAkosua.id,
    perWeek: 2, totalSessions: 15, durationMin: 45, startDaysAgo: 28, endInDays: 50,
    objectives: [
      { description: "Reduce leg pain from 6/10 to 2/10", baseline: "6", target: "2", unit: "pain score (0-10)", priority: "HIGH" },
      { description: "Improve SLR from 45° to 70°", baseline: "45", target: "70", unit: "degrees", priority: "HIGH" },
    ],
    interventions: [
      { name: "Manual therapy", description: "Neural mobilisation + lumbar PAIVMs", frequency: "2x/week", duration: "6 weeks", instructions: "SLR neural sliders" },
      { name: "Therapeutic exercises", description: "McKenzie extension programme", frequency: "Daily", duration: "6 weeks", instructions: "" },
    ],
  });

  const plan14 = await plan({
    episodeId: e14.id, version: 1, status: "ACTIVE", createdById: uEfua.id,
    perWeek: 3, totalSessions: 18, durationMin: 45, startDaysAgo: 52, endInDays: 30,
    objectives: [
      { description: "Achieve knee flexion 115°", baseline: "85", target: "115", unit: "degrees", priority: "HIGH" },
      { description: "Independent stair negotiation", baseline: "Needs rail", target: "Independent", unit: "qualitative", priority: "HIGH" },
    ],
    interventions: [
      { name: "Therapeutic exercises", description: "Progressive strengthening", frequency: "3x/week", duration: "10 weeks", instructions: "" },
      { name: "Electrotherapy", description: "NMES quadriceps activation", frequency: "2x/week", duration: "4 weeks", instructions: "" },
    ],
  });

  // ================= PATIENT PACKAGES =================
  const pp1 = await db.patientPackage.create({ data: { clinicId: clinic.id, patientId: p1.id, packageId: pkgBack.id, purchaseDate: d(-110), expiryDate: d(-20), totalSessions: 10, usedSessions: 6, amountPaidCents: 160000, status: "ACTIVE" } });
  await db.packageTransaction.create({ data: { patientPackageId: pp1.id, type: "PURCHASE", sessions: 10, amountCents: 160000, description: "Package purchased", performedById: uReception.id } });
  for (let i = 0; i < 6; i++) {
    await db.packageTransaction.create({ data: { patientPackageId: pp1.id, type: "DEDUCTION", sessions: -1, sessionId: `seed-ded-p1-${i}`, description: "Session deduction", performedById: uAkosua.id } });
  }

  const pp6 = await db.patientPackage.create({ data: { clinicId: clinic.id, patientId: p6.id, packageId: pkgSports.id, purchaseDate: d(-66), expiryDate: d(-6), totalSessions: 8, usedSessions: 8, amountPaidCents: 150000, status: "EXHAUSTED" } });
  await db.packageTransaction.create({ data: { patientPackageId: pp6.id, type: "PURCHASE", sessions: 8, amountCents: 150000, description: "Package purchased" } });

  const pp10 = await db.patientPackage.create({ data: { clinicId: clinic.id, patientId: p10.id, packageId: pkgBack.id, purchaseDate: d(-58), expiryDate: d(32), totalSessions: 10, usedSessions: 7, amountPaidCents: 160000, status: "ACTIVE" } });
  await db.packageTransaction.create({ data: { patientPackageId: pp10.id, type: "PURCHASE", sessions: 10, amountCents: 160000, description: "Package purchased" } });

  const pp15 = await db.patientPackage.create({ data: { clinicId: clinic.id, patientId: p15.id, packageId: pkgPost.id, purchaseDate: d(-52), expiryDate: d(68), totalSessions: 12, usedSessions: 5, amountPaidCents: 210000, status: "ACTIVE" } });
  await db.packageTransaction.create({ data: { patientPackageId: pp15.id, type: "PURCHASE", sessions: 12, amountCents: 210000, description: "Package purchased" } });

  // ================= APPOINTMENTS =================
  const appt = (o: { patientId: string; episodeId?: string | null; therapistId: string; day: number; hour: number; min?: number; durationMin?: number; status: string; purpose: string; walkIn?: boolean; notes?: string; branchId?: string }) =>
    db.appointment.create({
      data: {
        clinicId: clinic.id, branchId: o.branchId || branchMain.id,
        patientId: o.patientId, episodeId: o.episodeId || null, therapistId: o.therapistId,
        date: d(o.day), startMin: o.hour * 60 + (o.min || 0), endMin: o.hour * 60 + (o.min || 0) + (o.durationMin || 30),
        purpose: o.purpose, status: o.status, walkIn: o.walkIn || false, notes: o.notes, createdById: uReception.id,
      },
    });

  const apToday1 = await appt({ patientId: p1.id, episodeId: e1.id, therapistId: stAkosua.id, day: 0, hour: 9, status: "COMPLETED", purpose: "Follow-up Session", notes: "Session delivered — see therapy session record" });
  await appt({ patientId: p2.id, episodeId: e2.id, therapistId: stEfua.id, day: 0, hour: 10, min: 30, status: "CONFIRMED", purpose: "Follow-up Session" });
  const apToday3 = await appt({ patientId: p4.id, episodeId: e4.id, therapistId: stYaw.id, day: 0, hour: 11, status: "CONFIRMED", purpose: "Follow-up Session", notes: "15 sessions completed — progress review due" });
  const apToday4 = await appt({ patientId: p8.id, episodeId: e8.id, therapistId: stEfua.id, day: 0, hour: 13, status: "CONFIRMED", purpose: "Initial Assessment" });
  await appt({ patientId: p9.id, episodeId: null, therapistId: stAkosua.id, day: 0, hour: 14, status: "COMPLETED", purpose: "Initial Assessment", walkIn: true, notes: "Walk-in — attended but no treatment (consultation only)" });
  const apToday6 = await appt({ patientId: p10.id, episodeId: e9.id, therapistId: stEfua.id, day: 0, hour: 15, status: "SCHEDULED", purpose: "Follow-up Session" });
  const apToday7 = await appt({ patientId: p12.id, episodeId: e11.id, therapistId: stAkosua.id, day: 0, hour: 16, status: "SCHEDULED", purpose: "Follow-up Session" });

  // tomorrow & this week
  await appt({ patientId: p11.id, episodeId: e10.id, therapistId: stYaw.id, day: 1, hour: 9, status: "SCHEDULED", purpose: "Follow-up Session" });
  await appt({ patientId: p15.id, episodeId: e14.id, therapistId: stEfua.id, day: 1, hour: 11, status: "SCHEDULED", purpose: "Follow-up Session", branchId: branchAnnex.id });
  await appt({ patientId: p7.id, episodeId: e7.id, therapistId: stAkosua.id, day: 1, hour: 14, status: "CONFIRMED", purpose: "Follow-up Session" });
  await appt({ patientId: p14.id, episodeId: e13.id, therapistId: stYaw.id, day: 2, hour: 10, status: "SCHEDULED", purpose: "Initial Assessment" });
  await appt({ patientId: p5.id, episodeId: e5.id, therapistId: stEfua.id, day: 2, hour: 12, status: "SCHEDULED", purpose: "Progress Review", notes: "Review scheduled following plan review cycle" });
  await appt({ patientId: p1.id, episodeId: e1.id, therapistId: stAkosua.id, day: 3, hour: 9, status: "SCHEDULED", purpose: "Follow-up Session" });
  await appt({ patientId: p4.id, episodeId: e4.id, therapistId: stYaw.id, day: 3, hour: 11, status: "SCHEDULED", purpose: "Progress Review" });
  await appt({ patientId: p7.id, episodeId: e7.id, therapistId: stAkosua.id, day: 4, hour: 15, status: "SCHEDULED", purpose: "Follow-up Session" });
  await appt({ patientId: p10.id, episodeId: e9.id, therapistId: stEfua.id, day: 4, hour: 13, status: "SCHEDULED", purpose: "Follow-up Session", branchId: branchAnnex.id });

  // past week
  await appt({ patientId: p3.id, episodeId: e3.id, therapistId: stAkosua.id, day: -2, hour: 10, status: "CANCELLED", purpose: "Follow-up Session", notes: "Patient travelling" });
  const apPast5 = await appt({ patientId: p5.id, episodeId: e5.id, therapistId: stEfua.id, day: -1, hour: 9, status: "COMPLETED", purpose: "Follow-up Session" });
  await appt({ patientId: p6.id, episodeId: e6.id, therapistId: stAkosua.id, day: -12, hour: 11, status: "COMPLETED", purpose: "Discharge Review" });
  await appt({ patientId: p11.id, episodeId: e10.id, therapistId: stYaw.id, day: -3, hour: 14, status: "NO_SHOW", purpose: "Follow-up Session", notes: "Did not attend" });
  await appt({ patientId: p12.id, episodeId: e11.id, therapistId: stAkosua.id, day: -4, hour: 15, status: "ATTENDED_NO_TREATMENT", purpose: "Follow-up Session", notes: "Attended but felt unwell — treatment postponed" });

  // ================= THERAPY SESSIONS =================
  const completedSession = async (o: { episodeId: string; patientId: string; therapistId: string; day: number; hour: number; pain: number; interventions: { name: string; details?: string }[]; response: string; observations: string; durationMin?: number; appointmentId?: string }) =>
    db.therapySession.create({
      data: {
        clinicId: clinic.id, episodeId: o.episodeId, patientId: o.patientId, therapistId: o.therapistId,
        appointmentId: o.appointmentId || null,
        date: d(o.day, o.hour), timeMin: o.hour * 60, durationMin: o.durationMin || 45,
        status: "COMPLETED", painLevel: o.pain, painLevelEnd: Math.max(0, o.pain - 1),
        vitals: { create: [{ phase: "START", name: "Blood pressure", value: "125/80", unit: "mmHg" }, { phase: "START", name: "Heart rate", value: "72", unit: "bpm" }, { phase: "END", name: "Heart rate", value: "76", unit: "bpm" }] },
        patientResponse: o.response, observations: o.observations, therapistSignature: "Signed electronically",
        completedAt: d(o.day, o.hour + 1),
        interventions: { create: o.interventions.map((i) => ({ name: i.name, details: i.details })) },
      },
    });

  const history: { episodeId: string; patientId: string; therapistId: string; count: number; interventions: { name: string; details?: string }[] }[] = [
    { episodeId: e1.id, patientId: p1.id, therapistId: stAkosua.id, count: 10, interventions: [{ name: "Manual therapy", details: "Lumbar PAIVM grade III" }, { name: "Therapeutic exercises", details: "Core stabilisation" }, { name: "Electrotherapy", details: "TENS 20min" }] },
    { episodeId: e4.id, patientId: p4.id, therapistId: stYaw.id, count: 13, interventions: [{ name: "Gait training" }, { name: "Balance training" }, { name: "Strengthening", details: "Affected-side resistance" }] },
    { episodeId: e5.id, patientId: p5.id, therapistId: stEfua.id, count: 7, interventions: [{ name: "Manual therapy", details: "GH mobilisations" }, { name: "Stretching", details: "Capsular stretches" }] },
    { episodeId: e7.id, patientId: p7.id, therapistId: stAkosua.id, count: 5, interventions: [{ name: "Manual therapy" }, { name: "Stretching", details: "Calf stretches" }] },
    { episodeId: e9.id, patientId: p10.id, therapistId: stEfua.id, count: 9, interventions: [{ name: "Manual therapy" }, { name: "Strengthening" }, { name: "Postural correction" }] },
    { episodeId: e10.id, patientId: p11.id, therapistId: stYaw.id, count: 12, interventions: [{ name: "Therapeutic exercises" }, { name: "Gait training" }] },
    { episodeId: e11.id, patientId: p12.id, therapistId: stAkosua.id, count: 6, interventions: [{ name: "Therapeutic exercises", details: "McKenzie extension" }, { name: "Manual therapy" }] },
    { episodeId: e14.id, patientId: p15.id, therapistId: stEfua.id, count: 6, interventions: [{ name: "Therapeutic exercises" }, { name: "Electrotherapy", details: "NMES" }] },
    { episodeId: e6.id, patientId: p6.id, therapistId: stAkosua.id, count: 8, interventions: [{ name: "Sports rehabilitation exercises" }, { name: "Manual therapy" }] },
    { episodeId: e3.id, patientId: p3.id, therapistId: stAkosua.id, count: 6, interventions: [{ name: "Manual therapy" }, { name: "Stretching" }] },
    { episodeId: e12.id, patientId: p13.id, therapistId: stAkosua.id, count: 4, interventions: [{ name: "Manual therapy" }, { name: "Therapeutic exercises" }] },
  ];

  for (const h of history) {
    for (let i = 0; i < h.count; i++) {
      const day = weekday(-(3 + i * 2));
      await completedSession({
        episodeId: h.episodeId, patientId: h.patientId, therapistId: h.therapistId,
        day, hour: 9 + (i % 6), pain: Math.max(1, 6 - Math.floor(i / 3)),
        interventions: h.interventions,
        response: "Tolerated treatment well with good response",
        observations: "Progressive improvement noted across sessions",
      });
    }
  }

  const sToday = await completedSession({
    episodeId: e1.id, patientId: p1.id, therapistId: stAkosua.id, day: 0, hour: 9,
    pain: 4, interventions: [{ name: "Manual therapy", details: "Lumbar PAIVM grade III" }, { name: "Therapeutic exercises", details: "Core stabilisation progressions" }],
    response: "Tolerated well, pain reduced post-treatment",
    observations: "Improving lumbar flexion — now 50 degrees active",
    appointmentId: apToday1.id,
  });

  // session for yesterday's completed appointment (Kwabena)
  await completedSession({
    episodeId: e5.id, patientId: p5.id, therapistId: stEfua.id, day: -1, hour: 9,
    pain: 4, interventions: [{ name: "Manual therapy", details: "GH caudal glides" }, { name: "Stretching", details: "Capsular stretches" }],
    response: "Good response — increased ROM post-treatment",
    observations: "Flexion improved to 125 degrees passively",
    appointmentId: apPast5.id,
  });

  // ================= PROGRESS REVIEWS =================
  const firstObj5 = await db.planObjective.findFirst({ where: { planId: plan5.id }, orderBy: { id: "asc" } });
  const review1 = await db.progressReview.create({
    data: {
      clinicId: clinic.id, episodeId: e5.id, planId: plan5.id, triggerSessions: 15,
      reviewDate: d(-14), status: "COMPLETED",
      painCurrent: 4, painWorst: 7,
      romSummary: "Shoulder flexion 100° → 125°; external rotation 25° → 40°",
      strengthSummary: "Rotator cuff 4/5 → 4+/5",
      functionalSummary: "Dressing difficulty reduced from severe to moderate",
      comparison: JSON.stringify([
        { metric: "Pain (current)", baseline: "6/10", current: "4/10", change: "Improved" },
        { metric: "Shoulder flexion", baseline: "100°", current: "125°", change: "Improved" },
        { metric: "External rotation", baseline: "25°", current: "40°", change: "Improved" },
        { metric: "Sleep disturbance", baseline: "Severe", current: "Moderate", change: "Improved" },
      ]),
      improvements: "Notable improvement in flexion and night pain. Patient adherent to home programme.",
      patientResponse: "Responding well to capsular mobilisations and stretching",
      recommendations: "Continue current plan; add strengthening progression",
      decision: "CONTINUE",
      decisionNotes: "Continue current plan for another 8 sessions before next review",
      therapistSignature: "Signed electronically", completedAt: d(-14),
      objectiveResults: firstObj5 ? {
        create: [{ objectiveId: firstObj5.id, objectiveDescription: firstObj5.description, baseline: "100°", target: "150°", current: "125°", result: "PARTIALLY_ACHIEVED", notes: "On track" }],
      } : undefined,
    },
  });

  // ================= DISCHARGE (Efia) =================
  const dis1 = await db.discharge.create({
    data: {
      clinicId: clinic.id, episodeId: e6.id, patientId: p6.id, therapistId: stAkosua.id,
      dischargeDate: d(-12), status: "COMPLETED", reason: "Treatment objectives achieved",
      finalAssessment: "Full return to sprinting without pain. Hamstring strength 5/5 bilaterally. Negative take-home hop tests.",
      baselineComparison: JSON.stringify([
        { metric: "Pain", baseline: "7/10", current: "0/10", change: "Resolved" },
        { metric: "Hamstring strength", baseline: "3/5", current: "5/5", change: "Improved" },
        { metric: "Sprinting", baseline: "Unable", current: "Full speed", change: "Improved" },
      ]),
      objectiveOutcomes: "All objectives achieved: pain-free sprinting, full strength, return to training",
      remainingLimitations: "None significant",
      summary: "Completed sports rehabilitation following grade 2 hamstring strain. Progressive return-to-play programme completed over 8 weeks. Discharged in full competitive fitness.",
      followUpType: "TELEPHONE", followUpDetails: "Phone check-in in 4 weeks during competitive season",
      therapistSignature: "Signed electronically", completedAt: d(-12),
      recommendations: {
        create: [
          { exerciseName: "Nordic hamstring curls", instructions: "Eccentric emphasis", frequency: "2x/week", duration: "Ongoing", repetitions: "3 x 6", precautions: "Stop at pain onset" },
          { exerciseName: "Dynamic sprint warm-up", instructions: "Progressive acceleration runs", frequency: "Before every training", duration: "Ongoing", repetitions: "6 x 30m", precautions: "" },
        ],
      },
    },
  });

  // ================= INVOICES / PAYMENTS =================
  let invoiceSeq = 1;
  const invoice = async (o: {
    patientId: string; episodeId?: string; arrangement: string; status?: string;
    daysAgo: number; items: { serviceId: string; description: string; qty?: number; unitPriceCents: number; appliedRateCents?: number; coveragePercent?: number }[];
    paidCents?: number; insuranceCoveredCents?: number; method?: string;
  }) => {
    const subtotal = o.items.reduce((s, i) => s + i.unitPriceCents * (i.qty || 1), 0);
    const status = o.status || (o.paidCents !== undefined && o.paidCents >= subtotal ? "PAID" : o.paidCents ? "PARTIAL" : "UNPAID");
    const num = invoiceSeq++;
    return db.invoice.create({
      data: {
        clinicId: clinic.id, invoiceNumber: `INV-2025-${String(num).padStart(5, "0")}`,
        patientId: o.patientId, episodeId: o.episodeId || null, arrangement: o.arrangement,
        status, subtotalCents: subtotal, totalCents: subtotal,
        paidCents: o.paidCents || 0, insuranceCoveredCents: o.insuranceCoveredCents || 0,
        issuedAt: d(-o.daysAgo), issuedById: uReception.id,
        items: {
          create: o.items.map((i) => ({
            serviceId: i.serviceId, description: i.description, quantity: i.qty || 1,
            unitPriceCents: i.unitPriceCents, appliedRateCents: i.appliedRateCents || null,
            coveragePercent: i.coveragePercent || null,
            coveredCents: i.coveragePercent ? Math.round(i.unitPriceCents * (i.qty || 1) * i.coveragePercent / 100) : 0,
          })),
        },
      },
    });
  };

  const inv1 = await invoice({ patientId: p1.id, episodeId: e1.id, arrangement: "PACKAGE", daysAgo: 110, items: [{ serviceId: pkgBack.id, description: "Back Relief Pack — 10 sessions", unitPriceCents: 160000 }], paidCents: 160000, method: "MOBILE_MONEY" });
  const inv2 = await invoice({ patientId: p1.id, episodeId: e1.id, arrangement: "PAYG", daysAgo: 12, items: [{ serviceId: sManual.id, description: "Manual Therapy", unitPriceCents: 20000 }], paidCents: 10000, method: "CASH" });
  const inv3 = await invoice({ patientId: p2.id, episodeId: e2.id, arrangement: "INSURANCE", daysAgo: 18, items: [{ serviceId: sAssess.id, description: "Initial Assessment & Evaluation (Glory rate)", unitPriceCents: 25000, appliedRateCents: 22500, coveragePercent: 80 }], insuranceCoveredCents: 18000, paidCents: 4500, method: "INSURANCE" });
  const inv4 = await invoice({ patientId: p4.id, episodeId: e4.id, arrangement: "PAYG", daysAgo: 10, items: [{ serviceId: sGait.id, description: "Gait & Balance Training", unitPriceCents: 17000 }, { serviceId: sSession.id, description: "Physiotherapy Treatment Session", unitPriceCents: 18000 }], paidCents: 0 });
  const inv5 = await invoice({ patientId: p5.id, episodeId: e5.id, arrangement: "PAYG", daysAgo: 5, items: [{ serviceId: sSession.id, description: "Physiotherapy Treatment Session", unitPriceCents: 18000 }], paidCents: 18000, method: "CARD" });
  const inv6 = await invoice({ patientId: p6.id, episodeId: e6.id, arrangement: "PACKAGE", daysAgo: 66, items: [{ serviceId: pkgSports.id, description: "Sports Recovery Pack — 8 sessions", unitPriceCents: 150000 }], paidCents: 150000, method: "BANK_TRANSFER" });
  const inv7 = await invoice({ patientId: p7.id, episodeId: e7.id, arrangement: "INSURANCE", daysAgo: 20, items: [{ serviceId: sSession.id, description: "Physiotherapy Treatment Session (Acacia rate)", unitPriceCents: 18000, appliedRateCents: 15300, coveragePercent: 70 }], insuranceCoveredCents: 10710, paidCents: 4590, method: "INSURANCE" });
  const inv8 = await invoice({ patientId: p10.id, episodeId: e9.id, arrangement: "PACKAGE", daysAgo: 58, items: [{ serviceId: pkgBack.id, description: "Back Relief Pack — 10 sessions", unitPriceCents: 160000 }], paidCents: 160000, method: "MOBILE_MONEY" });
  const inv9 = await invoice({ patientId: p11.id, episodeId: e10.id, arrangement: "PAYG", daysAgo: 25, items: [{ serviceId: sSession.id, description: "Physiotherapy Treatment Session", unitPriceCents: 18000 }], paidCents: 0 });
  const inv10 = await invoice({ patientId: p12.id, episodeId: e11.id, arrangement: "INSURANCE", daysAgo: 15, items: [{ serviceId: sManual.id, description: "Manual Therapy (MetroCare rate)", unitPriceCents: 20000, appliedRateCents: 19000, coveragePercent: 85 }, { serviceId: sSession.id, description: "Physiotherapy Treatment Session (MetroCare rate)", unitPriceCents: 18000, appliedRateCents: 17100, coveragePercent: 85 }], insuranceCoveredCents: 30685, paidCents: 5315, method: "INSURANCE" });
  const inv11 = await invoice({ patientId: p15.id, episodeId: e14.id, arrangement: "PACKAGE", daysAgo: 52, items: [{ serviceId: pkgPost.id, description: "Post-Surgical Rehab Pack — 12 sessions", unitPriceCents: 210000 }], paidCents: 105000, method: "BANK_TRANSFER" });
  const inv12 = await invoice({ patientId: p9.id, arrangement: "PAYG", daysAgo: 0, items: [{ serviceId: sAssess.id, description: "Initial Assessment (consultation only)", unitPriceCents: 25000 }], paidCents: 25000, method: "CASH" });

  const pay = (invoiceId: string, amountCents: number, method: string, daysAgo: number, ref?: string) =>
    db.payment.create({ data: { clinicId: clinic.id, invoiceId, amountCents, method, reference: ref || null, paidAt: d(-daysAgo), receivedById: uReception.id } });
  await pay(inv1.id, 160000, "MOBILE_MONEY", 110, "MM-88213");
  await pay(inv2.id, 10000, "CASH", 12);
  await pay(inv3.id, 4500, "INSURANCE", 18, "GHI-GLORY-PAY-2211");
  await pay(inv5.id, 18000, "CARD", 5, "POS-77210");
  await pay(inv6.id, 150000, "BANK_TRANSFER", 66, "TT-55231");
  await pay(inv7.id, 4590, "INSURANCE", 20, "ACACIA-CLM-882");
  await pay(inv8.id, 160000, "MOBILE_MONEY", 58, "MM-90233");
  await pay(inv10.id, 5315, "INSURANCE", 15, "MTRC-CLM-551");
  await pay(inv11.id, 105000, "BANK_TRANSFER", 52, "TT-55310");
  await pay(inv12.id, 25000, "CASH", 0);

  await db.refund.create({ data: { clinicId: clinic.id, invoiceId: inv2.id, amountCents: 5000, reason: "Manual therapy charge applied in error", refundedAt: d(-11), approvedById: uAdmin.id } });

  const claim1 = await db.insuranceClaim.create({ data: { clinicId: clinic.id, providerId: provGlory.id, invoiceId: inv3.id, claimNumber: "CLM-2025-00001", claimedCents: 18000, status: "SUBMITTED", submittedDate: d(-17) } });
  await db.insuranceClaim.create({ data: { clinicId: clinic.id, providerId: provAcacia.id, invoiceId: inv7.id, claimNumber: "CLM-2025-00002", claimedCents: 10710, approvedCents: 10710, status: "APPROVED", submittedDate: d(-19), decisionDate: d(-15) } });
  const claim3 = await db.insuranceClaim.create({ data: { clinicId: clinic.id, providerId: provMetro.id, invoiceId: inv10.id, claimNumber: "CLM-2025-00003", claimedCents: 30685, approvedCents: 26000, status: "PARTIALLY_APPROVED", submittedDate: d(-14), decisionDate: d(-10) } });

  const fin = (type: string, patientId: string | null, amountCents: number, refType: string, refId: string, description: string, daysAgo: number) =>
    db.financialTransaction.create({ data: { clinicId: clinic.id, patientId, type, amountCents, refType, refId, description, performedById: uReception.id, createdAt: d(-daysAgo) } });
  await fin("PACKAGE_PURCHASE", p1.id, 160000, "Invoice", inv1.id, "Back Relief Pack purchase", 110);
  await fin("PAYMENT_RECEIVED", p1.id, 10000, "Invoice", inv2.id, "Part payment", 12);
  await fin("PAYMENT_RECEIVED", p5.id, 18000, "Invoice", inv5.id, "Card payment", 5);
  await fin("PACKAGE_PURCHASE", p6.id, 150000, "Invoice", inv6.id, "Sports Recovery Pack purchase", 66);
  await fin("PACKAGE_PURCHASE", p10.id, 160000, "Invoice", inv8.id, "Back Relief Pack purchase", 58);
  await fin("REFUND_ISSUED", p1.id, -5000, "Refund", inv2.id, "Refund for erroneous charge", 11);

  // ================= NOTIFICATIONS =================
  await db.notification.create({ data: { clinicId: clinic.id, audienceRole: "PHYSIOTHERAPIST", type: "PROGRESS_REVIEW_DUE", title: "Progress review due", message: "Akua Asantewaa has completed 15 sessions — progress review due.", entityType: "TreatmentEpisode", entityId: e4.id } });
  await db.notification.create({ data: { clinicId: clinic.id, audienceRole: "ADMIN", type: "OUTSTANDING_PAYMENT", title: "Outstanding payment", message: "Akua Asantewaa has an unpaid invoice of ₵350.00.", entityType: "Invoice", entityId: inv4.id } });
  await db.notification.create({ data: { clinicId: clinic.id, audienceRole: "ADMIN", type: "INSURANCE_CLAIM_UPDATE", title: "Claim partially approved", message: "MetroCare approved ₵260.00 of ₵306.85 claim for Esi Awuni.", entityType: "InsuranceClaim", entityId: claim3.id } });
  await db.notification.create({ data: { clinicId: clinic.id, audienceRole: "ADMIN", type: "PACKAGE_NEARING_EXHAUSTION", title: "Package nearing exhaustion", message: "Ama Darkoa has 3 sessions remaining on Back Relief Pack.", entityType: "PatientPackage", entityId: pp10.id } });
  await db.notification.create({ data: { clinicId: clinic.id, userId: uReception.id, type: "APPOINTMENT_NEW", title: "New appointment booked", message: "Adwoa Agyeman booked an initial assessment for today 1:00 PM.", entityType: "Appointment", entityId: apToday4.id } });

  // ================= AUDIT LOGS =================
  const aud = (action: string, entityType: string, entityId: string, userName: string, daysAgo: number, description?: string) =>
    db.auditLog.create({ data: { clinicId: clinic.id, userName, action, entityType, entityId, newValues: JSON.stringify({ description: description || action }), createdAt: d(-daysAgo) } });
  await aud("PATIENT_REGISTERED", "Patient", p1.id, "Kwame Owusu", 120, "Registered Kofi Mensah");
  await aud("PATIENT_REGISTERED", "Patient", p2.id, "Kwame Owusu", 21, "Registered Abena Osei");
  await aud("ASSESSMENT_COMPLETED", "Assessment", e1.id, "Akosua Frimpong", 112, "Initial assessment for Kofi Mensah");
  await aud("PLAN_ACTIVATED", "TreatmentPlan", plan1.id, "Akosua Frimpong", 110, "Activated treatment plan v1");
  await aud("SESSION_COMPLETED", "TherapySession", sToday.id, "Akosua Frimpong", 0, "Completed session for Kofi Mensah");
  await aud("REVIEW_COMPLETED", "ProgressReview", review1.id, "Efua Sarpong", 14, "Progress review for Kwabena Frimpong");
  await aud("EPISODE_DISCHARGED", "Discharge", dis1.id, "Akosua Frimpong", 12, "Discharged Efia Nyarko");
  await aud("PAYMENT_RECORDED", "Payment", inv5.id, "Kwame Owusu", 5, "Card payment received");
  await aud("CLAIM_SUBMITTED", "InsuranceClaim", claim1.id, "Ama Boateng", 17, "Submitted claim to Glory Health Insurance");
  await aud("PATIENT_REGISTERED", "Patient", p16.id, "Kwame Owusu", 5, "Registered Josephine Lartey");

  console.log("Seed complete.");
  console.log("Logins (password demo1234): admin@ | reception@ | akosua.frimpong@ | yaw.darko@ | efua.sarpong@ | management@gmrsphysio.com.gh");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
