"use client";
// AppFrame: providers + auth gate + shell, shared by every route under app/(app)/.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useIsFetching } from "@tanstack/react-query";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/templates/app-shell";
import { LoginScreen } from "@/components/organisms/login-screen";
import { SplashScreen } from "@/components/organisms/splash-screen";
import { registerRouter, useAuthStore } from "@/stores/app-store";

function Gate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  // let useUIStore.navigate() change the URL
  useEffect(() => {
    registerRouter((href) => router.push(href));
  }, [router]);

  // splash after a fresh login: covers the shell (which loads underneath) until the page's data has
  // loaded (no queries in flight for a short settle period), then fades out
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
    const min = setTimeout(() => setMinShown(true), 700); // never flash by
    const max = setTimeout(() => setSplash("leaving"), 8000); // never hang if a request stalls
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
