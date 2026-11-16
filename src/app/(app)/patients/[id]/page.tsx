"use client";
import { useParams, useRouter } from "next/navigation";
import PatientProfile from "@/components/features/patients/PatientProfile";

export default function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  return <PatientProfile patientId={id} onBack={() => router.push("/patients")} />;
}
