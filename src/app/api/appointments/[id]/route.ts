// ============ Appointment detail API: fetch + action-based PATCH (confirm/reschedule/cancel/…) ============
import {
  db, route, json, parseBody, ApiError,
  audit, notify, requireAuth, requirePermission, findTherapistConflict,
} from "@/server/api-exports";
import { PERMS } from "@/lib/constants";
import { minutesToTime } from "@/lib/format";
import { z } from "zod";

function parseDateParam(v?: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(v.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const appointmentInclude = {
  patient: { select: { id: true, patientCode: true, firstName: true, middleName: true, lastName: true, phone: true, email: true } },
  therapist: { select: { id: true, firstName: true, lastName: true, jobTitle: true, professionalDesignation: true } },
  episode: { select: { id: true, title: true, status: true } },
  sessions: { select: { id: true, status: true, date: true, timeMin: true, durationMin: true } },
} as const;

async function loadAppointment(id: string, clinicId: string) {
  const appt = await db.appointment.findFirst({
    where: { id, clinicId },
    include: appointmentInclude,
  });
  if (!appt) throw new ApiError(404, "Appointment not found");
  return appt;
}

// ============ GET /api/appointments/[id] ============
export const GET = route(async (req, ctx) => {
  const auth = requireAuth(req);
  const { id } = await ctx.params;
  const appointment = await loadAppointment(id, auth.clinicId);
  return json({ appointment });
});

// ============ PATCH /api/appointments/[id] — { action, ... } ============
const patchSchema = z.object({
  action: z.enum(["confirm", "reschedule", "cancel", "complete", "no_show", "attended_no_treatment", "update"]),
  reason: z.string().max(1000).nullish(),
  date: z.string().nullish(),
  startMin: z.number().int().min(0).max(1439).nullish(),
  endMin: z.number().int().min(1).max(1440).nullish(),
  purpose: z.string().max(120).nullish(),
  notes: z.string().max(4000).nullish(),
  therapistId: z.string().nullish(),
  episodeId: z.string().nullish(),
});

export const PATCH = route(async (req, ctx) => {
  const auth = requirePermission(req, PERMS.appointmentsManage);
  const { id } = await ctx.params;
  const body = await parseBody(req, patchSchema);

  const appointment = await loadAppointment(id, auth.clinicId);
  const patientName = `${appointment.patient.firstName} ${appointment.patient.lastName}`;
  const timeLabel = `${minutesToTime(appointment.startMin)}–${minutesToTime(appointment.endMin)}`;

  const auditAndNotify = async (action: string, newValues: Record<string, unknown>, notifyBody?: { type: string; title: string; message: string }) => {
    await audit({
      clinicId: auth.clinicId,
      userId: auth.userId,
      userName: auth.name,
      action,
      entityType: "Appointment",
      entityId: appointment.id,
      previousValues: { status: appointment.status, date: appointment.date, startMin: appointment.startMin, endMin: appointment.endMin },
      newValues,
    });
    if (notifyBody) {
      await notify({
        clinicId: auth.clinicId,
        audienceRole: "PHYSIOTHERAPIST",
        type: notifyBody.type,
        title: notifyBody.title,
        message: notifyBody.message,
        entityType: "Appointment",
        entityId: appointment.id,
      });
    }
  };

  switch (body.action) {
    case "confirm": {
      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { status: "CONFIRMED" },
        include: appointmentInclude,
      });
      await auditAndNotify("APPOINTMENT_CONFIRMED", { status: "CONFIRMED" }, {
        type: "APPOINTMENT_CONFIRMED",
        title: "Appointment confirmed",
        message: `${patientName} confirmed for ${new Date(appointment.date).toDateString()} ${timeLabel}.`,
      });
      return json({ appointment: updated });
    }

    case "reschedule": {
      if (!body.date || body.startMin === undefined || body.startMin === null || body.endMin === undefined || body.endMin === null) {
        throw new ApiError(400, "Reschedule requires date, startMin and endMin");
      }
      if (body.endMin <= body.startMin) throw new ApiError(400, "End time must be after start time");
      const newDate = parseDateParam(body.date);
      if (!newDate) throw new ApiError(400, "Invalid date — use YYYY-MM-DD");

      const conflicts = await findTherapistConflict({
        therapistId: appointment.therapistId,
        date: newDate,
        startMin: body.startMin,
        endMin: body.endMin,
        excludeAppointmentId: appointment.id,
      });
      if (conflicts.length > 0) {
        const c = conflicts[0];
        throw new ApiError(
          409,
          `Therapist already has an appointment from ${minutesToTime(c.startMin)} to ${minutesToTime(c.endMin)} (patient ${c.patient.firstName} ${c.patient.lastName}) — pick another time`,
          "CONFLICT",
        );
      }

      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { date: newDate, startMin: body.startMin, endMin: body.endMin, status: "RESCHEDULED" },
        include: appointmentInclude,
      });
      await auditAndNotify(
        "APPOINTMENT_RESCHEDULED",
        { date: newDate.toISOString(), startMin: body.startMin, endMin: body.endMin, status: "RESCHEDULED" },
        {
          type: "APPOINTMENT_RESCHEDULED",
          title: "Appointment rescheduled",
          message: `${patientName} moved to ${newDate.toDateString()} ${minutesToTime(body.startMin)}–${minutesToTime(body.endMin)}.`,
        },
      );
      return json({ appointment: updated });
    }

    case "cancel": {
      const reason = (body.reason || "").trim();
      const notes = [appointment.notes, `[Cancelled${reason ? `: ${reason}` : ""}]`].filter(Boolean).join("\n");
      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELLED", notes },
        include: appointmentInclude,
      });
      await auditAndNotify(
        "APPOINTMENT_CANCELLED",
        { status: "CANCELLED", reason: reason || null },
        {
          type: "APPOINTMENT_CANCELLED",
          title: "Appointment cancelled",
          message: `${patientName}'s appointment on ${new Date(appointment.date).toDateString()} ${timeLabel} was cancelled${reason ? ` — ${reason}` : ""}.`,
        },
      );
      return json({ appointment: updated });
    }

    case "complete": {
      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { status: "COMPLETED" },
        include: appointmentInclude,
      });
      await auditAndNotify("APPOINTMENT_COMPLETED", { status: "COMPLETED" });
      return json({ appointment: updated });
    }

    case "no_show": {
      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { status: "NO_SHOW" },
        include: appointmentInclude,
      });
      await auditAndNotify("APPOINTMENT_NO_SHOW", { status: "NO_SHOW" }, {
        type: "APPOINTMENT_NO_SHOW",
        title: "Patient no-show",
        message: `${patientName} did not show up for ${timeLabel} on ${new Date(appointment.date).toDateString()}.`,
      });
      return json({ appointment: updated });
    }

    case "attended_no_treatment": {
      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: { status: "ATTENDED_NO_TREATMENT" },
        include: appointmentInclude,
      });
      await auditAndNotify("APPOINTMENT_ATTENDED_NO_TREATMENT", { status: "ATTENDED_NO_TREATMENT" });
      return json({ appointment: updated });
    }

    case "update": {
      const data: Record<string, unknown> = {};
      let therapistChanged = false;

      if (body.purpose !== undefined) data.purpose = body.purpose || null;
      if (body.notes !== undefined) data.notes = body.notes || null;

      if (body.episodeId !== undefined) {
        if (body.episodeId) {
          const episode = await db.treatmentEpisode.findFirst({ where: { id: body.episodeId, clinicId: auth.clinicId } });
          if (!episode) throw new ApiError(404, "Treatment episode not found");
          if (episode.patientId !== appointment.patientId) throw new ApiError(400, "Episode does not belong to this appointment's patient");
        }
        data.episodeId = body.episodeId || null;
      }

      if (body.therapistId && body.therapistId !== appointment.therapistId) {
        const therapist = await db.staffProfile.findFirst({ where: { id: body.therapistId, clinicId: auth.clinicId } });
        if (!therapist) throw new ApiError(404, "Therapist not found");
        if (!therapist.isTherapist) throw new ApiError(400, "Selected staff member is not a physiotherapist");
        const conflicts = await findTherapistConflict({
          therapistId: body.therapistId,
          date: new Date(appointment.date),
          startMin: appointment.startMin,
          endMin: appointment.endMin,
          excludeAppointmentId: appointment.id,
        });
        if (conflicts.length > 0) {
          const c = conflicts[0];
          throw new ApiError(
            409,
            `Therapist already has an appointment from ${minutesToTime(c.startMin)} to ${minutesToTime(c.endMin)} (patient ${c.patient.firstName} ${c.patient.lastName}) — pick another therapist or time`,
            "CONFLICT",
          );
        }
        data.therapistId = body.therapistId;
        therapistChanged = true;
      }

      const updated = await db.appointment.update({
        where: { id: appointment.id },
        data: data as never,
        include: appointmentInclude,
      });
      await auditAndNotify(therapistChanged ? "APPOINTMENT_THERAPIST_CHANGED" : "APPOINTMENT_UPDATED", data, therapistChanged ? {
        type: "APPOINTMENT_UPDATED",
        title: "Appointment therapist changed",
        message: `${patientName}'s appointment at ${timeLabel} was reassigned.`,
      } : undefined);
      return json({ appointment: updated });
    }

    default:
      throw new ApiError(400, "Unknown action");
  }
});
