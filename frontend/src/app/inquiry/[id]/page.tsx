import type { Metadata } from "next";
import { InquiryDetail } from "@/components/Inquiry";

export const metadata: Metadata = { title: "문의" };

export default async function InquiryDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sent?: string }> }) {
  const { id } = await params;
  const { sent } = await searchParams;
  return <InquiryDetail id={id} sent={sent === "1"} />;
}
