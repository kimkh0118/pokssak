import type { Metadata } from "next";
import { Inbox } from "@/components/Inbox";

export const metadata: Metadata = { title: "알림함" };

export default function NotificationsPage() {
  return <Inbox />;
}
