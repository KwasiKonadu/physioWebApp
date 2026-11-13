/**
 * Standalone API smoke test for the patients module.
 * Invokes route handlers directly (no HTTP server needed).
 * Usage: bun run scripts/test-patients-api.ts
 */
import { GET as patientsList, POST as patientsCreate } from "../src/app/api/patients/route";
import { GET as duplicatesGet } from "../src/app/api/patients/duplicates/route";
import { GET as patientGet, PATCH as patientPatch } from "../src/app/api/patients/[id]/route";
import { POST as episodeCreate } from "../src/app/api/patients/[id]/episodes/route";
import { GET as episodeGet, PATCH as episodePatch } from "../src/app/api/episodes/[id]/route";
import { signToken } from "../src/server/auth";
import { db } from "../src/lib/db";

let failures = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`✅ ${label}`);
  } else {
    failures++;
    console.error(`❌ ${label}`, extra !== undefined ? JSON.stringify(extra).slice(0, 500) : "");
  }
}

async function main() {
  const clinic = await db.clinic.findFirstOrThrow();
  const admin = await db.user.findFirstOrThrow({ where: { email: "admin@gmrsphysio.com.gh" }, include: { role: true } });
  const perms = JSON.parse(admin.role.permissions) as string[];
  const token = signToken(
    { sub: admin.id, clinicId: clinic.id, email: admin.email, name: admin.name, role: admin.role.name, permissions: perms, type: "access" },
    3600
  );
  const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const ctxNoParams = { params: Promise.resolve({}) };

  // 1. LIST
  const listRes = await patientsList(new Request("http://local/api/patients?page=1&pageSize=5", { headers: auth }), ctxNoParams);
  const list = await listRes.json();
  check("GET /api/patients returns 200", listRes.status === 200);
  check("list has items+total", Array.isArray(list.items) && typeof list.total === "number", list);
  console.log(`   → total=${list.total}, first=${list.items[0]?.patientCode} ${list.items[0]?.lastName}`);

  // 2. LIST with search + filters + sort
  const searchRes = await patientsList(
    new Request("http://local/api/patients?search=mensah&status=IN_TREATMENT&arrangement=PACKAGE&sort=lastName&order=asc&pageSize=10", { headers: auth }),
    ctxNoParams
  );
  const searchData = await searchRes.json();
  check("GET /api/patients search+filter works", searchRes.status === 200 && Array.isArray(searchData.items));

  // 3. REGISTER (full payload)
  const suffix = Date.now().toString().slice(-4);
  const regBody = {
    firstName: "Test",
    middleName: "",
    lastName: `Okoro${suffix}`,
    dateOfBirth: "2015-06-01",
    gender: "MALE",
    phone: `+233 55 ${suffix} ${suffix}`,
    altPhone: "",
    email: `test.okoro${suffix}@example.com`,
    address: "12 Test Street, Accra",
    occupation: "Tester",
    maritalStatus: "SINGLE",
    nationality: "Ghanaian",
    emergencyContacts: [
      { fullName: "Mama Okoro", relationship: "Mother", phone: "+233 20 111 0000", altPhone: "", address: "", isNextOfKin: true },
    ],
    medicalHistory: [
      { type: "CONDITION", name: "Asthma", details: "Mild, inhaler as needed" },
      { type: "OTHER", name: "No relevant medical history", details: "" },
    ],
    referral: { source: "DOCTOR", referrerName: "Dr. Ampofo", referrerContact: "+233 27 000 0000", referralDate: "2025-01-10", notes: "Knee rehab" },
    paymentArrangement: "INSURANCE",
    insurance: {
      providerId: (await db.insuranceProvider.findFirstOrThrow({ where: { clinicId: clinic.id } })).id,
      membershipNumber: `MEM-${suffix}`,
      policyNumber: "POL-1",
      validFrom: "2025-01-01",
      validTo: "2025-12-31",
      principalMember: "Papa Okoro",
      relationshipToPrincipal: "DEPENDANT",
    },
    consent: {
      treatmentConsent: true,
      dataConsent: true,
      signatureName: "Test Okoro",
      consentDate: "2025-01-15",
      guardianName: "Mama Okoro",
      guardianRelationship: "Mother",
    },
  };
  const createRes = await patientsCreate(new Request("http://local/api/patients", { method: "POST", headers: auth, body: JSON.stringify(regBody) }), ctxNoParams);
  const created = await createRes.json();
  check("POST /api/patients returns 201", createRes.status === 201, created);
  check("patientCode generated PT-xxxxxx", /^PT-\d{6}$/.test(created.patientCode || ""), created.patientCode);
  check("currentStatus NO_EPISODE", created.currentStatus === "NO_EPISODE");
  check("emergency contact created", created.emergencyContacts?.length === 1);
  check("medical history created", created.medicalHistory?.length === 2);
  check("insurance + provider included", created.insurances?.length === 1 && !!created.insurances[0].provider?.name);
  check("referral created", created.referrals?.length === 1);
  check("consent created", created.consents?.length === 1 && created.consents[0].treatmentConsent === true);
  const patientId = created.id as string;

  // 4. Validation failure (missing firstName + no treatment consent)
  const badRes = await patientsCreate(new Request("http://local/api/patients", { method: "POST", headers: auth, body: JSON.stringify({ phone: "123", consent: { treatmentConsent: false, dataConsent: false } }) }), ctxNoParams);
  const bad = await badRes.json();
  check("POST validation fails cleanly (400)", badRes.status === 400 && !!bad.error?.message, bad);

  // 5. DUPLICATES — phone suffix match
  const dupRes = await duplicatesGet(new Request(`http://local/api/patients/duplicates?phone=${encodeURIComponent(regBody.phone)}&firstName=Test&lastName=${encodeURIComponent(`okoro${suffix}`)}`, { headers: auth }), ctxNoParams);
  const dups = await dupRes.json();
  check("duplicates finds same phone", dupRes.status === 200 && dups.items.length === 1 && dups.items[0].id === patientId, dups);

  // 6. PROFILE BUNDLE
  const bundleRes = await patientGet(new Request("http://local/api/patients/x", { headers: auth }), { params: Promise.resolve({ id: patientId }) });
  const bundle = await bundleRes.json();
  check("GET /api/patients/[id] 200", bundleRes.status === 200, bundle);
  check("bundle has episodes/appointments/stats", Array.isArray(bundle.episodes) && Array.isArray(bundle.appointments) && !!bundle.stats);
  check("bundle invoices array", Array.isArray(bundle.invoices));

  // 7. PATCH demographics + replace contacts/history/insurance
  const patchRes = await patientPatch(
    new Request("http://local/api/patients/x", {
      method: "PATCH", headers: auth,
      body: JSON.stringify({
        email: `updated${suffix}@example.com`,
        occupation: "Senior Tester",
        emergencyContacts: [{ fullName: "Papa Okoro", relationship: "Father", phone: "+233 21 555 0000", isNextOfKin: true }],
        medicalHistory: [{ type: "ALLERGY", name: "Peanuts", details: "Severe" }],
        insurance: [],
      }),
    }),
    { params: Promise.resolve({ id: patientId }) }
  );
  const patched = await patchRes.json();
  check("PATCH /api/patients/[id] 200", patchRes.status === 200, patched);
  check("contacts replaced", patched.emergencyContacts?.length === 1 && patched.emergencyContacts[0].fullName === "Papa Okoro");
  check("history replaced", patched.medicalHistory?.length === 1 && patched.medicalHistory[0].type === "ALLERGY");
  check("insurance cleared", patched.insurances?.length === 0);
  check("demographics updated", patched.patient.email === `updated${suffix}@example.com`);

  // no-op PATCH
  const noopRes = await patientPatch(new Request("http://local/api/patients/x", { method: "PATCH", headers: auth, body: "{}" }), { params: Promise.resolve({ id: patientId }) });
  check("PATCH no-op ok", noopRes.status === 200);

  // 8. OPEN EPISODE
  const epRes = await episodeCreate(
    new Request(`http://local/api/patients/${patientId}/episodes`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Right knee rehab", notes: "Post-op" }) }),
    { params: Promise.resolve({ id: patientId }) }
  );
  const episode = await epRes.json();
  check("POST episodes 201", epRes.status === 201, episode);
  check("episodeNumber = 1", episode.episodeNumber === 1);
  check("status AWAITING_ASSESSMENT", episode.status === "AWAITING_ASSESSMENT");
  check("reviewThreshold from settings (15 default)", episode.reviewThreshold >= 1);

  // patient status synced
  const bundle2 = (await (await patientGet(new Request("http://local/api/patients/x", { headers: auth }), { params: Promise.resolve({ id: patientId }) })).json());
  check("patient status → AWAITING_ASSESSMENT after episode", bundle2.patient.currentStatus === "AWAITING_ASSESSMENT", bundle2.patient.currentStatus);

  // second episode numbering
  const ep2Res = await episodeCreate(
    new Request(`http://local/api/patients/${patientId}/episodes`, { method: "POST", headers: auth, body: JSON.stringify({ title: "Shoulder pain" }) }),
    { params: Promise.resolve({ id: patientId }) }
  );
  const ep2 = await ep2Res.json();
  check("second episodeNumber = 2", ep2Res.status === 201 && ep2.episodeNumber === 2);

  // 9. EPISODE GET
  const epGetRes = await episodeGet(new Request("http://local/api/episodes/x", { headers: auth }), { params: Promise.resolve({ id: episode.id }) });
  const epGet = await epGetRes.json();
  check("GET /api/episodes/[id] 200", epGetRes.status === 200 && epGet.patient?.patientCode === created.patientCode, epGet?.patient);
  check("episode counts present", typeof epGet._count?.sessions === "number");

  // 10. PLACE ON HOLD
  const holdRes = await episodePatch(
    new Request("http://local/api/episodes/x", { method: "PATCH", headers: auth, body: JSON.stringify({ action: "place_on_hold", reason: "Travelled abroad", notes: "Back in March" }) }),
    { params: Promise.resolve({ id: episode.id }) }
  );
  const held = await holdRes.json();
  check("place_on_hold → ON_HOLD", holdRes.status === 200 && held.status === "ON_HOLD", held);
  check("holdHistory appended", held.holdHistory?.length === 1 && held.holdHistory[0].reason === "Travelled abroad");

  const bundle3 = (await (await patientGet(new Request("http://local/api/patients/x", { headers: auth }), { params: Promise.resolve({ id: patientId }) })).json());
  // syncPatientStatus follows the MOST RECENT open episode — ep2 (Shoulder pain) is still AWAITING_ASSESSMENT
  check("patient status stays synced (ep2 still open → AWAITING_ASSESSMENT)", bundle3.patient.currentStatus === "AWAITING_ASSESSMENT", bundle3.patient.currentStatus);

  // hold without reason → 400
  const holdBad = await episodePatch(new Request("http://local/api/episodes/x", { method: "PATCH", headers: auth, body: JSON.stringify({ action: "place_on_hold" }) }), { params: Promise.resolve({ id: ep2.id }) });
  check("hold without reason → 400", holdBad.status === 400);

  // resume after ep2 discontinued → only ep1 open → resumes to AWAITING_ASSESSMENT and patient syncs
  const resumeRes = await episodePatch(new Request("http://local/api/episodes/x", { method: "PATCH", headers: auth, body: JSON.stringify({ action: "resume" }) }), { params: Promise.resolve({ id: episode.id }) });
  const resumed = await resumeRes.json();
  check("resume → AWAITING_ASSESSMENT", resumeRes.status === 200 && resumed.status === "AWAITING_ASSESSMENT", resumed.status);
  check("holdHistory retained on resume", resumed.holdHistory?.length === 1);

  // resume when not on hold → 409
  const resumeBad = await episodePatch(new Request("http://local/api/episodes/x", { method: "PATCH", headers: auth, body: JSON.stringify({ action: "resume" }) }), { params: Promise.resolve({ id: episode.id }) });
  check("resume when not on hold → 409", resumeBad.status === 409);

  // 12. DISCONTINUE
  const discRes = await episodePatch(
    new Request("http://local/api/episodes/x", { method: "PATCH", headers: auth, body: JSON.stringify({ action: "discontinue", reason: "Patient relocated" }) }),
    { params: Promise.resolve({ id: ep2.id }) }
  );
  const disc = await discRes.json();
  check("discontinue → DISCONTINUED + closedDate", discRes.status === 200 && disc.status === "DISCONTINUED" && !!disc.closedDate);

  // 13. ASSIGN THERAPIST via episode PATCH + sync
  const therapist = await db.staffProfile.findFirstOrThrow({ where: { clinicId: clinic.id, isTherapist: true } });
  const thRes = await episodePatch(
    new Request("http://local/api/episodes/x", { method: "PATCH", headers: auth, body: JSON.stringify({ therapistId: therapist.id, title: "Right knee rehabilitation" }) }),
    { params: Promise.resolve({ id: episode.id }) }
  );
  const th = await thRes.json();
  check("episode therapist update", thRes.status === 200 && th.therapistId === therapist.id && th.title === "Right knee rehabilitation");
  const bundle4 = (await (await patientGet(new Request("http://local/api/patients/x", { headers: auth }), { params: Promise.resolve({ id: patientId }) })).json());
  check("patient assignedTherapist synced", bundle4.patient.assignedTherapist?.id === therapist.id);

  // 14. Authz: no token → 401; bad permission → 403
  const anon = await patientsList(new Request("http://local/api/patients"), ctxNoParams);
  check("list without token → 401", anon.status === 401);
  const roUser = await db.user.findFirstOrThrow({ where: { role: { name: "Management" } }, include: { role: true } });
  const roToken = signToken({ sub: roUser.id, clinicId: clinic.id, email: roUser.email, name: roUser.name, role: roUser.role.name, permissions: JSON.parse(roUser.role.permissions), type: "access" }, 3600);
  const forbidden = await patientsCreate(new Request("http://local/api/patients", { method: "POST", headers: { Authorization: `Bearer ${roToken}`, "Content-Type": "application/json" }, body: "{}" }), ctxNoParams);
  check("register without patients.manage → 403", forbidden.status === 403);

  // 15. 404s
  const nf = await patientGet(new Request("http://local/api/patients/x", { headers: auth }), { params: Promise.resolve({ id: "does-not-exist" }) });
  check("unknown patient → 404", nf.status === 404);
  const epNf = await episodeGet(new Request("http://local/api/episodes/x", { headers: auth }), { params: Promise.resolve({ id: "does-not-exist" }) });
  check("unknown episode → 404", epNf.status === 404);

  // cleanup test patient (FK-safe order)
  await db.treatmentEpisode.deleteMany({ where: { patientId } });
  await db.emergencyContact.deleteMany({ where: { patientId } });
  await db.medicalHistoryEntry.deleteMany({ where: { patientId } });
  await db.patientConsent.deleteMany({ where: { patientId } });
  await db.patientReferral.deleteMany({ where: { patientId } });
  await db.patientInsurance.deleteMany({ where: { patientId } });
  await db.patient.deleteMany({ where: { id: patientId } });
  await db.auditLog.deleteMany({ where: { entityId: patientId } });
  await db.auditLog.deleteMany({ where: { entityType: "TreatmentEpisode", entityId: { in: [episode.id, ep2.id] } } });
  console.log(failures === 0 ? "\n🎉 ALL CHECKS PASSED" : `\n💥 ${failures} CHECK(S) FAILED`);
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
