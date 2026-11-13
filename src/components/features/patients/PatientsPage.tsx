"use client";
// ============ Patients module root: directory ↔ profile with cross-module navigation intake ============
import { useEffect, useState } from "react";
import { useUIStore } from "@/stores/app-store";
import PatientsDirectory from "./PatientsDirectory";
import PatientProfile from "./PatientProfile";

export default function PatientsPage() {
  // receive a target patient passed from other modules (e.g. appointments / billing / dashboard).
  // The nav opts store is an external system: read it lazily on mount, then subscribe for updates.
  const [openPatientId, setOpenPatientId] = useState<string | null>(() => {
    const target = useUIStore.getState().navOpts?.patientId ?? null;
    if (target) useUIStore.getState().clearOpts();
    return target;
  });

  useEffect(() => {
    const unsubscribe = useUIStore.subscribe((state, prev) => {
      if (state.navOpts !== prev.navOpts) {
        const target = state.navOpts?.patientId ?? null;
        if (target) {
          setOpenPatientId(target);
          useUIStore.getState().clearOpts();
        }
      }
    });
    return unsubscribe;
  }, []);

  return openPatientId ? (
    <PatientProfile patientId={openPatientId} onBack={() => setOpenPatientId(null)} />
  ) : (
    <PatientsDirectory onOpen={setOpenPatientId} />
  );
}
