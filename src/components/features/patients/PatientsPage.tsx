"use client";
// ============ Patients module root (/patients): the directory. Profiles live at /patients/[id]. ============
import { useUIStore } from "@/stores/app-store";
import PatientsDirectory from "./PatientsDirectory";

export default function PatientsPage() {
  const navigate = useUIStore((s) => s.navigate);
  return <PatientsDirectory onOpen={(patientId) => navigate("patients", { patientId })} />;
}
