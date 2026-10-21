import type { Metadata } from "next";
import { Wizard } from "@/components/Wizard";

export const metadata: Metadata = { title: "우리 집 분석하기" };

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <Wizard key={mode} mode={mode === "sample" ? "sample" : "live"} />;
}
