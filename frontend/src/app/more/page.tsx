import type { Metadata } from "next";
import { More } from "@/components/More";

export const metadata: Metadata = { title: "더보기" };

export default function MorePage() {
  return <More />;
}
