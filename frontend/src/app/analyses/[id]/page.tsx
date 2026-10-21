import type { Metadata } from "next";
import { Suspense } from "react";
import { ResultView } from "@/components/ResultView";

export const metadata: Metadata = { title: "비교 결과", robots: { index: false, follow: false } };

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ResultView id={id} />
    </Suspense>
  );
}
