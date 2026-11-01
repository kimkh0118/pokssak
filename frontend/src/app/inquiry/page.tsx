import type { Metadata } from "next";
import { Inquiry } from "@/components/Inquiry";

export const metadata: Metadata = { title: "문의하기" };

export default function InquiryPage() {
  return <Inquiry />;
}
