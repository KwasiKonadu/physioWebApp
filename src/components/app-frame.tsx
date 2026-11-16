"use client";
// AppFrame: providers + auth gate + shell, shared by every route under app/(app)/.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/templates/app-shell";
import { LoginScreen } from "@/components/organisms/login-screen";
import { registerRouter, useAuthStore } from "@/stores/app-store";

function Gate({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  // let useUIStore.navigate() change the URL
  useEffect(() => {
    registerRouter((href) => router.push(href));
  }, [router]);

  // zustand persist with sync localStorage hydrates at store creation — safe to read once
  const [hydrated] = useState(() => useAuthStore.persist?.hasHydrated?.() ?? false);
  if (!hydrated) {
    return <div className="flex min-h-screen items-center justify-center bg-workspace" />;
  }
  return user ? <AppShell>{children}</AppShell> : <LoginScreen />;
}

export default function AppFrame({ children }: { children: React.ReactNode }) {
  return (
    <Providers>
      <Gate>{children}</Gate>
    </Providers>
  );
}
