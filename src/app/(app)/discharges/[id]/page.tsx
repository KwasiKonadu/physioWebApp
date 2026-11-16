"use client";
import { useParams } from "next/navigation";
import DischargeRoute from "@/components/features/discharges/DischargeRoute";

export default function DischargeDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <DischargeRoute key={id} id={id} />;
}
