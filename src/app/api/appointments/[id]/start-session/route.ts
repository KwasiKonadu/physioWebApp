// ============ Start a therapy session from an appointment (idempotent bridge to Therapy Sessions module) ============
// A therapy session is ONLY created here — completing an appointment never auto-creates one.
import { db, route, json, ApiError, audit, notify, requirePermission } from "@/server/api-exports";
import { PERMS } from "@/lib/constants";

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export const POST = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.clinicalManage);
  const { id } = await ctx.params;

  const appointment = await db.appointment.findFirst({
    where: { id, clinicId: auth.clinicId },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      sessions: { select: { id: true, status: true } },
    },
  });
  if (!appointment) throw new ApiError(404, "Appointment not found");

  // Idempotent: if a session is already linked to this appointment, return it
  const existing = await db.therapySession.findFirst({
    where: { appointmentId: appointment.id, clinicId: auth.clinicId },
  });
  if (existing) return json({ session: existing, existing: true });

  const now = new Date();
  const apptDate = new Date(appointment.date);
  const isToday = isSameLocalDay(apptDate, now);
  const eligible = appointment.status === "COMPLETED" || ((appointment.status === "SCHEDULED" || appointment.status === "CONFIRMED") && isToday);
  if (!eligible) {
    throw new ApiError(
      409,
      appointment.status === "COMPLETED"
        ? "Appointment is completed"
        : `Session can only be started for today's scheduled/confirmed appointments or completed appointments (status: ${appointment.status})`,
    );
  }

  if (!appointment.episodeId) {
    throw new ApiError(400, "Appointment must be linked to a treatment episode");
  }

  const episode = await db.treatmentEpisode.findFirst({ where: { id: appointment.episodeId, clinicId: auth.clinicId } });
  if (!episode) throw new ApiError(404, "Treatment episode not found");

  const session = await db.therapySession.create({
    data: {
      clinicId: auth.clinicId,
      episodeId: appointment.episodeId,
      patientId: appointment.patientId,
      therapistId: appointment.therapistId,
      appointmentId: appointment.id,
      date: apptDate,
      timeMin: appointment.startMin,
      durationMin: appointment.endMin - appointment.startMin,
      status: "PLANNED",
    },
  });

  await audit({
    clinicId: auth.clinicId,
    userId: auth.userId,
    userName: auth.name,
    action: "SESSION_STARTED",
    entityType: "TherapySession",
    entityId: session.id,
    newValues: { appointmentId: appointment.id, episodeId: appointment.episodeId, patientId: appointment.patientId, status: "PLANNED" },
  });

  await notify({
    clinicId: auth.clinicId,
    audienceRole: "PHYSIOTHERAPIST",
    type: "SESSION_STARTED",
    title: "Therapy session started",
    message: `A therapy session was started for ${appointment.patient.firstName} ${appointment.patient.lastName} from their appointment.`,
    entityType: "TherapySession",
    entityId: session.id,
  });

  return json({ session, existing: false }, 201);
});
