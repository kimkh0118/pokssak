import type { Metadata } from "next";
import { Flow } from "@/components/Flow";

export const metadata: Metadata = { title: "빈집 분석" };

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return <Flow key={q ?? ""} initialQuery={q} />;
}
