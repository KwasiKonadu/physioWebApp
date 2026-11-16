"use client";
// Route wrapper: /therapy-sessions/[id]
import { useRouter } from "next/navigation";
import SessionDocumentView from "./SessionDocumentView";

export default function SessionRoute({ id }: { id: string }) {
  const router = useRouter();
  return <SessionDocumentView sessionId={id} onBack={() => router.push("/therapy-sessions")} />;
}
