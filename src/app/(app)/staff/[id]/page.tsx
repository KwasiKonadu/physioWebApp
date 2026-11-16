"use client";
import { useParams, useRouter } from "next/navigation";
import StaffProfile from "@/components/features/staff/StaffProfile";

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <StaffProfile staffId={id} onBack={() => router.push("/staff")} />;
}
