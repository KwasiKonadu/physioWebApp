"use client";
// Add / edit insurance membership dialog.
import { useState } from "react";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import { useInsuranceProviders, type InsuranceDto } from "./hooks";

export function InsuranceDialog({ open, entry, onOpenChange, onSave, saving }: {
  open: boolean;
  entry: InsuranceDto | null;
  onOpenChange: (o: boolean) => void;
  onSave: (body: { providerId: string; membershipNumber: string; policyNumber: string; validFrom: string; validTo: string; principalMember: string; relationshipToPrincipal: string }) => void;
  saving: boolean;
}) {
  const providers = useInsuranceProviders();
  // state is initialised from the target entry — parent remounts this dialog with a key per target
  const [providerId, setProviderId] = useState(entry?.providerId || "");
  const [membershipNumber, setMembershipNumber] = useState(entry?.membershipNumber || "");
  const [policyNumber, setPolicyNumber] = useState(entry?.policyNumber || "");
  const [validFrom, setValidFrom] = useState(entry?.validFrom ? String(entry.validFrom).slice(0, 10) : "");
  const [validTo, setValidTo] = useState(entry?.validTo ? String(entry.validTo).slice(0, 10) : "");
  const [principalMember, setPrincipalMember] = useState(entry?.principalMember || "");
  const [relationshipToPrincipal, setRelationshipToPrincipal] = useState(entry?.relationshipToPrincipal || "");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit insurance policy" : "Add insurance policy"}</DialogTitle>
          <DialogDescription>The policy list is replaced on save.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Provider *</Label>
            <Select value={providerId} onValueChange={setProviderId}>
              <SelectTrigger><SelectValue placeholder="Select provider" /></SelectTrigger>
              <SelectContent>
                {(providers.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Membership number *</Label>
            <Input value={membershipNumber} onChange={(e) => setMembershipNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Policy number</Label>
            <Input value={policyNumber} onChange={(e) => setPolicyNumber(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Principal member</Label>
            <Input value={principalMember} onChange={(e) => setPrincipalMember(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Relationship to principal</Label>
            <Input value={relationshipToPrincipal} onChange={(e) => setRelationshipToPrincipal(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Valid from</Label>
              <Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Valid to</Label>
              <Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave({ providerId, membershipNumber, policyNumber, validFrom, validTo, principalMember, relationshipToPrincipal })} disabled={saving}>
            {saving ? <AtomIcon name="Loader2" className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Save policy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
