import type { Metadata } from "next";
import { MyAssets } from "@/components/MyAssets";

export const metadata: Metadata = { title: "내 자산" };

export default function MyPage() {
  return <MyAssets />;
}
