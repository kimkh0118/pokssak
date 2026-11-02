import type { Metadata } from "next";
import { Suspense } from "react";
import { NotifyPrime } from "@/components/NotifyPrime";

export const metadata: Metadata = { title: "알림 설정" };

export default function NotifyPage() {
  return <Suspense><NotifyPrime /></Suspense>;
}
