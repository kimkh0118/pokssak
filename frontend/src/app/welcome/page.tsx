import type { Metadata } from "next";
import { Suspense } from "react";
import { Onboarding } from "@/components/Onboarding";

export const metadata: Metadata = { title: "시작하기" };

export default function WelcomePage() {
  return <Suspense><Onboarding /></Suspense>;
}
