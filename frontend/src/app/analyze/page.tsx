import type { Metadata } from "next";
import { Flow } from "@/components/Flow";

export const metadata: Metadata = { title: "빈집 분석" };

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ mode?: string; q?: string }> }) {
  const { mode, q } = await searchParams;
  return <Flow key={`${mode}-${q}`} mode={mode === "sample" ? "sample" : "live"} initialQuery={q} />;
}
