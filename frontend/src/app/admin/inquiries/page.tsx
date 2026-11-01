import type { Metadata } from "next";
import { AdminInquiries } from "@/components/AdminInquiries";

export const metadata: Metadata = { title: "문의 관리", robots: { index: false } };

export default function AdminInquiriesPage() {
  return <AdminInquiries />;
}
