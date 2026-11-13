"use client";
// The clinic app is fully client-rendered (auth state lives in localStorage).
import dynamic from "next/dynamic";

const AppRoot = dynamic(() => import("@/components/app-root"), {
  ssr: false,
  loading: () => <div className="min-h-screen bg-workspace" />,
});

export default function Page() {
  return <AppRoot />;
}
