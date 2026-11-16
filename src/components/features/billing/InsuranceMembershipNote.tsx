"use client";
// Shows the patient's insurance membership on file for the chosen provider.

import { formatDate } from "@/lib/format";
import { labelize } from "@/lib/constants";
import { Membership } from "./invoice-draft";

export function InsuranceMembershipNote({ selectedMembership, membershipExpired, providerId, memberships }: {
  selectedMembership: Membership | null;
  membershipExpired: boolean;
  providerId: string;
  memberships: Membership[];
}) {
  return (
    <div className="sm:col-span-6">
      {selectedMembership ? (
        <div className={`rounded-lg border px-3 py-2.5 text-sm ${membershipExpired || selectedMembership.status !== "ACTIVE" ? "border-amber-200 bg-amber-50" : "border-sky-200 bg-sky-50/60"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Insurance membership on file</p>
            {membershipExpired ? (
              <span className="text-xs font-medium text-amber-700">Expired {formatDate(selectedMembership.validTo as string)} — check with the patient</span>
            ) : selectedMembership.status !== "ACTIVE" ? (
              <span className="text-xs font-medium text-amber-700">Membership is {labelize(selectedMembership.status)}</span>
            ) : null}
          </div>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-4">
            <div><dt className="text-muted-foreground">Membership no.</dt><dd className="font-mono text-sm font-semibold">{selectedMembership.membershipNumber}</dd></div>
            <div><dt className="text-muted-foreground">Policy no.</dt><dd className="font-medium">{selectedMembership.policyNumber || "—"}</dd></div>
            <div><dt className="text-muted-foreground">Valid until</dt><dd className="font-medium">{selectedMembership.validTo ? formatDate(selectedMembership.validTo) : "No end date"}</dd></div>
            <div><dt className="text-muted-foreground">Principal member</dt><dd className="font-medium">{selectedMembership.principalMember ? `${selectedMembership.principalMember}${selectedMembership.relationshipToPrincipal ? ` (${labelize(selectedMembership.relationshipToPrincipal)})` : ""}` : "Self"}</dd></div>
          </dl>
        </div>
      ) : providerId ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This patient has no membership on file with the selected provider. Check the card, then add it on their profile.
        </p>
      ) : memberships.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          No insurance membership on file for this patient. Add one on their profile before billing insurance.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">Choose a provider to see this patient&apos;s membership details.</p>
      )}
    </div>
  );
}
