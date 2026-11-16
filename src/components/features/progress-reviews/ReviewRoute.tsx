"use client";
// Route wrapper: /progress-reviews/[id]
import { useRouter } from "next/navigation";
import ReviewForm from "./ReviewForm";

export default function ReviewRoute({ id }: { id: string }) {
  const router = useRouter();
  return <ReviewForm reviewId={id} onBack={() => router.push("/progress-reviews")} />;
}
