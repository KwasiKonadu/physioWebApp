"use client";
// ORGANISM: login screen
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useAuthStore, type AuthUser } from "@/stores/app-store";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/molecules/field";
import { PasswordInput } from "@/components/molecules/password-input";

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

// how long the exit animation runs before the splash takes over (matches the durations below)
const EXIT_MS = 800;

export function LoginScreen({ slideIn = false }: { slideIn?: boolean }) {
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  // after a successful sign-in the screen animates out (panel right, logo right, headline down) before the splash
  // (after signing out it starts in that off-screen state and slides back into view)
  const [exiting, setExiting] = useState(slideIn);
  useEffect(() => {
    if (!slideIn) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setExiting(false)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [slideIn]);

  const signIn = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const res = await apiFetch<LoginResponse>("/api/auth/login", { json: { email, password }, method: "POST" });
      setExiting(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      await new Promise((r) => setTimeout(r, reduce ? 0 : EXIT_MS));
      setAuth(res.user, res.accessToken, res.refreshToken);
      toast.success(`Welcome back, ${res.user.name.split(" ")[0]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-navy-900 lg:flex-row">
      {/* Brand panel */}
      <div className="relative flex flex-1 flex-col p-8 lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" />
        <div className={cn("flex items-center gap-3 transition-all duration-800 motion-reduce:transition-none", exiting ? "ease-in" : "ease-out", exiting && "translate-x-[-120vw]")}>
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/20">
            <img src="/appicon.svg" alt="" className="h-7 w-7" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">GMRS Physiotherapy</p>
            <p className="text-xs text-slate-300">Clinic Management System</p>
          </div>
        </div>
        <div className={cn("relative mt-auto max-w-lg pt-10 transition-all duration-800 motion-reduce:transition-none", exiting ? "ease-in" : "ease-out", exiting && "translate-y-[60vh] opacity-0")}>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-white lg:text-2xl">
            Every patient journey, from first visit to discharge.
          </h1>
          <p className="mt-3 text-sm text-slate-400">
            Book, assess, treat, review and bill — in one place.
          </p>
        </div>
      </div>

      {/* Sign-in panel */}
      <div className={cn("flex w-full items-center justify-center bg-white p-8 transition-transform duration-800 motion-reduce:transition-none lg:w-120 lg:rounded-l-3xl lg:shadow-2xl", exiting ? "ease-in translate-x-full" : "ease-out")}>
        <div className="w-full max-w-sm">
          <form onSubmit={signIn} className="space-y-4">
            <Field label="Email" htmlFor="email">
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </Field>
            <Field label="Password" htmlFor="password">
              <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
            </Field>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
