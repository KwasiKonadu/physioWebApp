"use client";
import { useParams } from "next/navigation";
import PlanRoute from "@/components/features/treatment-plans/PlanRoute";

export default function PlanEditPage() {
  const { id } = useParams<{ id: string }>();
  return <PlanRoute key={id} kind="edit" id={id} />;
}
