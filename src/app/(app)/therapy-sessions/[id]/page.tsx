"use client";
import { useParams } from "next/navigation";
import SessionRoute from "@/components/features/therapy-sessions/SessionRoute";

export default function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <SessionRoute key={id} id={id} />;
}
