"use client";
import { useParams } from "next/navigation";
import ReviewRoute from "@/components/features/progress-reviews/ReviewRoute";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  return <ReviewRoute key={id} id={id} />;
}
