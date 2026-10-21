import { Wizard } from "@/components/Wizard";

export default async function AnalyzePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const { mode } = await searchParams;
  return <Wizard mode={mode === "sample" ? "sample" : "live"} />;
}
