// ============ Patients: duplicate detection during registration ============
import { Prisma } from "@prisma/client";
import { db, route, json, getQuery, requireAuth } from "@/server/api-exports";

const lower = (s: string) => s.trim().toLowerCase();
const digits = (s: string) => s.replace(/\D/g, "");
const sameDay = (a?: Date | null, b?: Date | null) =>
  !!a && !!b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// GET ?phone=&firstName=&lastName=&dob=
export const GET = route(async (req) => {
  const auth = requireAuth(req);

  const phone = (getQuery(req, "phone") || "").trim();
  const firstName = (getQuery(req, "firstName") || "").trim();
  const lastName = (getQuery(req, "lastName") || "").trim();
  const dobRaw = (getQuery(req, "dob") || "").trim();

  // match on the last 7+ digits of the phone number (formatting-insensitive)
  const phoneDigits = digits(phone);
  const suffix = phoneDigits.length >= 7 ? phoneDigits.slice(-7) : "";

  const qDob = dobRaw ? new Date(dobRaw) : null;
  const dobValid = !!qDob && !Number.isNaN(qDob.getTime());

  const or: Prisma.PatientWhereInput[] = [];
  if (suffix) {
    or.push({ phone: { endsWith: suffix } });
  }
  if (firstName && lastName) {
    // SQLite `contains` is case-insensitive (LIKE) → casts a wide net, exact matching below
    or.push({ AND: [{ firstName: { contains: firstName, mode: "insensitive" } }, { lastName: { contains: lastName, mode: "insensitive" } }] });
  }
  if (dobValid && lastName) {
    or.push({ AND: [{ dateOfBirth: qDob as Date }, { lastName: { contains: lastName, mode: "insensitive" } }] });
  }

  if (or.length === 0) return json({ items: [] });

  const candidates = await db.patient.findMany({
    where: { clinicId: auth.clinicId, OR: or },
    select: {
      id: true,
      patientCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      phone: true,
      dateOfBirth: true,
      currentStatus: true,
    },
    take: 100,
  });

  const items = candidates
    .filter((c) => {
      if (suffix && digits(c.phone).endsWith(suffix)) return true;
      if (firstName && lastName && lower(c.firstName) === lower(firstName) && lower(c.lastName) === lower(lastName)) return true;
      if (dobValid && lastName && sameDay(c.dateOfBirth, qDob) && lower(c.lastName) === lower(lastName)) return true;
      return false;
    })
    .slice(0, 5);

  return json({ items });
});
