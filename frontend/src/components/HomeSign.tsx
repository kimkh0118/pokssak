"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddressSign } from "./AddressSign";

export function HomeSign() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  function go() {
    if (q.trim().length < 2) return setError("주소를 두 글자 이상 입력해 주세요. 예: 해운대로 570");
    setError(null);
    router.push(`/analyze?q=${encodeURIComponent(q.trim())}`);
  }
  return (
    <div>
      <AddressSign value={q} onChange={(v) => { setQ(v); setError(null); }} onSubmit={go} />
      {error && <p role="alert" className="mt-2 text-[13px] font-bold text-bad">{error}</p>}
    </div>
  );
}
