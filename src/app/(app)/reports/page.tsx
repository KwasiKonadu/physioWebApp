import { Suspense } from "react";
import ReportsPage from "@/components/features/reports/ReportsPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReportsPage />
    </Suspense>
  );
}
