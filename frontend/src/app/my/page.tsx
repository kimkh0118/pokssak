import type { Metadata } from "next";
import { MyAssets } from "@/components/MyAssets";

export const metadata: Metadata = { title: "관심 집" };

export default function MyPage() {
  return <MyAssets />;
}
