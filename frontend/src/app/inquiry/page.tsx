import type { Metadata } from "next";
import { InquiryList } from "@/components/Inquiry";

export const metadata: Metadata = { title: "문의하기" };

export default function InquiryPage() {
  return <InquiryList />;
}
