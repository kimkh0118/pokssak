import type { Metadata } from "next";
import { ResultView } from "@/components/ResultView";

export const metadata: Metadata = { title: "분석 결과", robots: { index: false, follow: false } };

export default async function AnalysisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ResultView id={id} />;
}
