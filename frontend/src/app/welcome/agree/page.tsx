import type { Metadata } from "next";
import { Suspense } from "react";
import { ConsentForm } from "@/components/ConsentForm";

export const metadata: Metadata = { title: "약관 동의" };

export default function AgreePage() {
  return <Suspense><ConsentForm /></Suspense>;
}
