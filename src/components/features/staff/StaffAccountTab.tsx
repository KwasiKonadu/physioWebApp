"use client";
// Staff profile: account tab.

import { SectionCard } from "@/components/molecules/section-card";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { StaffDetail } from "./staff-profile-model";
import { PasswordInput } from "@/components/molecules/password-input";

export function StaffAccountTab({ data, s, name, canManage, canManageUsers, busy, newPassword, resetOpen, resetPassword, toggleAccount, setCreateEmail, setCreateRoleId, setNewPassword, setCreateOpen, setResetOpen }: { data: StaffDetail; s: StaffDetail["staff"]; name: string; canManage: boolean; canManageUsers: boolean; busy: boolean; newPassword: string; resetOpen: boolean; resetPassword: () => void; toggleAccount: (active: boolean) => void; setCreateEmail: (v: string) => void; setCreateRoleId: (v: string) => void; setNewPassword: (v: string) => void; setCreateOpen: (v: boolean) => void; setResetOpen: (v: boolean) => void }) {
  return (
    <TabsContent value="account" className="space-y-4">
      <SectionCard title="Login account" icon="ShieldCheck">
        {data.account ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{data.account.email}</p>
                <p className="text-xs text-muted-foreground">{data.account.roleName}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">{data.account.active ? "Active" : "Inactive"}</span>
                <Switch checked={data.account.active} onCheckedChange={(v) => void toggleAccount(v)} disabled={!canManageUsers && !canManage} />
              </div>
            </div>
            {!data.account.active ? <p className="text-xs text-amber-600">Deactivated users cannot sign in until reactivated.</p> : null}
            {canManageUsers ? (
              resetOpen ? (
                <div className="flex w-full max-w-md items-center gap-2">
                  <PasswordInput placeholder="New password (min 8 chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
                  <Button size="sm" onClick={() => void resetPassword()} disabled={busy}>Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setResetOpen(false); setNewPassword(""); }}>Cancel</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => setResetOpen(true)}>
                  <AtomIcon name="KeyRound" className="mr-1.5 h-3.5 w-3.5" /> Reset password
                </Button>
              )
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">No login account linked to this staff profile.</p>
            {canManageUsers ? (
              <Button size="sm" variant="outline" onClick={() => { setCreateEmail(s.email || ""); setCreateRoleId(""); setCreateOpen(true); }}>
                <AtomIcon name="UserPlus" className="mr-1.5 h-3.5 w-3.5" /> Create account
              </Button>
            ) : null}
          </div>
        )}
      </SectionCard>
    </TabsContent>
  );
}
