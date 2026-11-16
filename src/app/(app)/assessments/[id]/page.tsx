"use client";
import { useParams } from "next/navigation";
import AssessmentRoute from "@/components/features/assessments/AssessmentRoute";

export default function AssessmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <AssessmentRoute key={id} id={id} />;
}
