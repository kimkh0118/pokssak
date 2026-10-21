import type { Metadata } from "next";
import { Admin } from "@/components/Admin";

export const metadata: Metadata = { title: "관리자", robots: { index: false, follow: false } };

export default function AdminPage() {
  return <Admin />;
}
