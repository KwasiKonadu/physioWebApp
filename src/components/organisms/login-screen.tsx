"use client";
// ORGANISM: login screen with role quick-select demo accounts
import { useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore, type AuthUser } from "@/stores/app-store";
import { AtomIcon } from "@/components/atoms/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

const DEMO_ACCOUNTS = [
  { role: "Clinic Administrator", email: "admin@gmrsphysio.com.gh", name: "Ama Boateng", icon: "ShieldCheck" },
  { role: "Receptionist", email: "reception@gmrsphysio.com.gh", name: "Kwame Owusu", icon: "ConciergeBell" },
  { role: "Physiotherapist", email: "akosua.frimpong@gmrsphysio.com.gh", name: "Akosua Frimpong", icon: "Stethoscope" },
  { role: "Management", email: "management@gmrsphysio.com.gh", name: "Nana Adjei", icon: "BarChart3" },
];

export function LoginScreen() {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("admin@gmrsphysio.com.gh");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);

  const signIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", { json: { email, password }, method: "POST" });
      setAuth(res.user, res.accessToken, res.refreshToken);
      toast.success(`Welcome back, ${res.user.name.split(" ")[0]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-navy-900 lg:flex-row">
      {/* Brand panel */}
      <div className="relative flex flex-1 flex-col justify-between overflow-hidden p-8 lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <AtomIcon name="Waves" className="h-6 w-6 text-teal-50" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">GMRS Physiotherapy</p>
            <p className="text-xs text-slate-300">Clinic Management System</p>
          </div>
        </div>
        <div className="relative my-10 max-w-lg">
          <h1 className="text-3xl font-bold leading-tight text-white lg:text-4xl">
            The complete patient journey, from registration to discharge.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-slate-300">
            Appointments, clinical assessments, treatment plans, therapy sessions, progress reviews,
            packages, insurance billing and operational reporting — one secure workspace for your whole clinic team.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-4">
            {[
              { icon: "Users", label: "Patient records" },
              { icon: "Activity", label: "Therapy sessions" },
              { icon: "Receipt", label: "Billing & claims" },
            ].map((f) => (
              <div key={f.label} className="rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
                <AtomIcon name={f.icon} className="h-5 w-5 text-teal-400" />
                <p className="mt-2 text-xs font-medium text-slate-200">{f.label}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-400">12 Liberation Road, Airport Residential, Accra · Ghana</p>
      </div>

      {/* Sign-in panel */}
      <div className="flex w-full items-center justify-center bg-white p-8 lg:w-[480px] lg:rounded-l-3xl lg:shadow-2xl">
        <div className="w-full max-w-sm">
          <h2 className="text-xl font-bold text-navy-800">Sign in</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use your clinic account credentials.</p>

          <form onSubmit={signIn} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>

          <div className="my-6 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">demo accounts (password: demo1234)</span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            {DEMO_ACCOUNTS.map((a) => (
              <button
                key={a.email}
                type="button"
                onClick={() => {
                  setEmail(a.email);
                  setPassword("demo1234");
                }}
                className="flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors hover:border-teal-500 hover:bg-teal-50"
              >
                <AtomIcon name={a.icon} className="h-4 w-4 text-teal-600" />
                <span className="text-xs font-semibold text-foreground">{a.role}</span>
                <span className="text-[10px] text-muted-foreground">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
