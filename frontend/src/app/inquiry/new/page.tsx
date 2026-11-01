import type { Metadata } from "next";
import { InquiryNew } from "@/components/Inquiry";

export const metadata: Metadata = { title: "새 문의" };

export default function NewInquiryPage() {
  return <InquiryNew />;
}
