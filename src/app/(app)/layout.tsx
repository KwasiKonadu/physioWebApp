"use client";
// The clinic app is fully client-rendered (auth state lives in localStorage).
import dynamic from "next/dynamic";

const AppFrame = dynamic(() => import("@/components/app-frame"), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-workspace" />,
});

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppFrame>{children}</AppFrame>;
}
