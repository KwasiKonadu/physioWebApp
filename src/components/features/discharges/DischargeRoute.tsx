"use client";
// Route wrapper: /discharges/[id]
import { useRouter } from "next/navigation";
import DischargeForm from "./DischargeForm";

export default function DischargeRoute({ id }: { id: string }) {
  const router = useRouter();
  return <DischargeForm dischargeId={id} onBack={() => router.push("/discharges")} />;
}
