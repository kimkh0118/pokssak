"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { InquiryRow, type InquiryItem } from "./Inquiry";
import { Notice } from "./ui";

const FILTERS = [{ key: "open", label: "답변 대기" }, { key: "answered", label: "답변 완료" }, { key: "all", label: "전체" }] as const;

// 관리자: 문의 목록(답 안 한 것 먼저). 누르면 상세에서 답장
export function AdminInquiries() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [items, setItems] = useState<InquiryItem[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api<{ inquiries: InquiryItem[]; open: number }>(`/api/admin/inquiries?status=${filter}`)
      .then((r) => { if (alive) { setItems(r.inquiries); setOpenCount(r.open); setErr(null); } })
      .catch((e) => alive && setErr(e.message));
    return () => { alive = false; };
  }, [filter]);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-[24px] font-extrabold">문의 관리</h1>
        <p className="mt-1 text-[14px] text-subtle">문의를 눌러 답장하면 보낸 사람에게 알림이 가요.</p>
      </div>
      <div className="flex gap-1.5" role="tablist" aria-label="문의 상태">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => { setItems(null); setFilter(f.key); }}
            className={`press rounded-full px-4 py-2 text-[14px] font-bold ring-1 ${filter === f.key ? "bg-ink text-white ring-ink" : "bg-surface text-muted ring-line"}`}>
            {f.label}{f.key === "open" && openCount > 0 ? ` ${openCount}` : ""}
          </button>
        ))}
      </div>
      {err && <Notice tone="bad">{err}</Notice>}
      {items === null && !err ? <div className="h-24 animate-pulse rounded-2xl bg-fill" /> : items?.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-[14px] text-subtle shadow-sm ring-1 ring-line">
          {filter === "open" ? "답할 문의가 없어요." : "문의가 없어요."}
        </p>
      ) : (
        <ul className="space-y-2">{items?.map((q) => <InquiryRow key={q.id} q={q} showEmail />)}</ul>
      )}
    </div>
  );
}
