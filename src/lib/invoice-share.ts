// Patient vs insurer split for an invoice. totalCents stays the GROSS billed amount (insurer settlements are
// recorded as INSURANCE payments against it); the patient only owes total - insuranceCovered (their co-pay),
// unless the claim was rejected, in which case the patient is responsible for the full balance.
export function patientShare(inv: {
  totalCents: number;
  insuranceCoveredCents: number;
  arrangement: string;
  payments: { amountCents: number; method: string }[];
  refunds?: { amountCents: number }[];
  claimStatus?: string | null;
}) {
  const insured = inv.arrangement === "INSURANCE" && inv.insuranceCoveredCents > 0 && inv.claimStatus !== "REJECTED";
  const shareCents = insured ? Math.max(0, inv.totalCents - inv.insuranceCoveredCents) : inv.totalCents;
  const paidByPatient =
    inv.payments.filter((p) => p.method !== "INSURANCE").reduce((s, p) => s + p.amountCents, 0) -
    (inv.refunds ?? []).reduce((s, r) => s + r.amountCents, 0);
  return { insured, shareCents, paidByPatient, remainingCents: Math.max(0, shareCents - paidByPatient) };
}
