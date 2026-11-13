// Collocated helper (underscore file — not a route). Catalogue edit permission.
import { PERMS } from "@/lib/constants";

export function canManageCatalogue(perms: string[]): boolean {
  return perms.includes(PERMS.packagesManage) || perms.includes(PERMS.settingsManage);
}
