"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressSign } from "./AddressSign";

export function HomeSign() {
  const router = useRouter();
  const [q, setQ] = useState("");
  return <AddressSign value={q} onChange={setQ} onSubmit={() => router.push(`/analyze?mode=live&q=${encodeURIComponent(q)}`)} />;
}
