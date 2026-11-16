"use client";
import { useParams } from "next/navigation";
import PlanRoute from "@/components/features/treatment-plans/PlanRoute";

export default function PlanRevisePage() {
  const { id } = useParams<{ id: string }>();
  return <PlanRoute key={id} kind="revise" id={id} />;
}
