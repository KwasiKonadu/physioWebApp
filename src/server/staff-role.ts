// Staff role resolution: the staff role is a Role row (Settings → Manage roles).
// Only the built-in Physiotherapist system role marks a staff member as a therapist.
import { db, ApiError } from "@/server/api-exports";
import { ROLE_NAMES, LEGACY_STAFF_ROLE_BY_NAME } from "@/lib/constants";

export async function resolveStaffRole(clinicId: string, roleId: string) {
  const role = await db.role.findUnique({ where: { id: roleId } });
  if (!role || role.clinicId !== clinicId) throw new ApiError(400, "Invalid role");
  const isTherapist = role.system && role.name === ROLE_NAMES.physiotherapist;
  // legacy code stored in StaffProfile.staffRole; custom roles are "CUSTOM"
  const staffRole = LEGACY_STAFF_ROLE_BY_NAME[role.name] ?? "CUSTOM";
  return { role, isTherapist, staffRole };
}
