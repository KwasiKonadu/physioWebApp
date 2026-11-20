"use client";
// AppFrame: providers + auth gate + shell, shared by every route under app/(app)/.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useIsFetching } from "@tanstack/react-query";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/templates/app-shell";
import { LoginScreen } from "@/components/organisms/login-screen";
import { SplashScreen } from "@/components/organisms/splash-screen";
import { registerRouter, useAuthStore } from "@/stores/app-store";

const SPLASH_MAX_MS = 1500;
const RETURN_KEY = "returnTo"; // last page visited before the login screen

function Gate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  // let useUIStore.navigate() change the URL
  useEffect(() => {
    registerRouter((href) => router.push(href));
  }, [router]);

  // splash after a fresh login: covers the shell (which loads underneath) until the page's first data has
  // loaded (no queries in flight for a short settle period), then fades out. Capped at SPLASH_MAX_MS so one
  // slow endpoint never blocks the app — pages render their own skeletons underneath.
  const fetching = useIsFetching();
  const [splash, setSplash] = useState<"off" | "on" | "leaving">("off");
  const [minShown, setMinShown] = useState(false);
  const [prevUser, setPrevUser] = useState(user);
  const [loggedOut, setLoggedOut] = useState(false); // true after signing out, so the login screen slides back in
  if (user !== prevUser) {
    setPrevUser(user);
    if (!prevUser && user) { setSplash("on"); setMinShown(false); setLoggedOut(false); }
    if (prevUser && !user) setLoggedOut(true);
  }
  useEffect(() => {
    if (splash !== "on") return;
    const min = setTimeout(() => setMinShown(true), 500); // never flash by
    const max = setTimeout(() => setSplash("leaving"), SPLASH_MAX_MS); // never hang if a request stalls
    return () => { clearTimeout(min); clearTimeout(max); };
  }, [splash]);
  useEffect(() => {
    if (splash !== "on" || !minShown || fetching > 0) return;
    const settle = setTimeout(() => setSplash("leaving"), 250); // a page may start its next request right after one ends
    return () => clearTimeout(settle);
  }, [splash, minShown, fetching]);
  useEffect(() => {
    if (splash !== "leaving") return;
    const t = setTimeout(() => setSplash("off"), 300);
    return () => clearTimeout(t);
  }, [splash]);

  // zustand persist with sync localStorage hydrates at store creation — safe to read once
  const [hydrated] = useState(() => useAuthStore.persist?.hasHydrated?.() ?? false);

  // The login screen lives at /login. Signed out: remember the page you were on and move to /login.
  // Signed in: leave /login for the remembered page (or the dashboard).
  const pathname = usePathname();
  useEffect(() => {
    if (!hydrated) return;
    const onLogin = pathname === "/login";
    if (!user && !onLogin) {
      try { localStorage.setItem(RETURN_KEY, window.location.pathname + window.location.search); } catch {}
      router.replace("/login");
    } else if (user && onLogin) {
      let back: string | null = null;
      try { back = localStorage.getItem(RETURN_KEY); } catch {}
      router.replace(back && back !== "/login" ? back : "/dashboard");
    }
  }, [hydrated, user, pathname, router]);
  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center bg-workspace" />;
  }
  if (!user) return <LoginScreen slideIn={loggedOut} />;
  return (
    <>
      <AppShell>{children}</AppShell>
      {splash !== "off" ? <SplashScreen leaving={splash === "leaving"} /> : null}
    </>
  );
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Gate>{children}</Gate>
    </Providers>
  );
}
