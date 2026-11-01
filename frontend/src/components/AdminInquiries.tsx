"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { InquiryCard, type InquiryItem } from "./Inquiry";
import { Notice } from "./ui";

const FILTERS = [{ key: "open", label: "답변 대기" }, { key: "answered", label: "답변 완료" }, { key: "all", label: "전체" }] as const;

function ReplyBox({ q, onDone }: { q: InquiryItem; onDone: (q: InquiryItem) => void }) {
  const [open, setOpen] = useState(!q.reply);
  const [text, setText] = useState(q.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-3 text-[13px] font-bold text-subtle underline">답장 고치기</button>;
  return (
    <form className="mt-3 space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try {
        onDone(await api<InquiryItem>(`/api/admin/inquiries/${q.id}/reply`, { method: "POST", body: { reply: text } }));
        setOpen(false);
      } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    }}>
      <label className="sr-only" htmlFor={`r-${q.id}`}>답장</label>
      <textarea id={`r-${q.id}`} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={2000} placeholder="답장을 적어 주세요"
        className="block w-full resize-none rounded-xl bg-fill p-3 text-[14px] leading-relaxed outline-none focus:ring-2 focus:ring-brand" />
      {err && <p role="alert" className="text-[13px] font-bold text-bad">{err}</p>}
      <button type="submit" disabled={busy || text.trim().length < 2}
        className="press h-11 w-full rounded-xl bg-ink text-[15px] font-bold text-white disabled:opacity-40">{busy ? "보내는 중…" : q.reply ? "답장 고쳐 보내기" : "답장 보내기"}</button>
    </form>
  );
}

// 관리자: 문의 확인·답장. 답 안 한 문의가 위에, 오래된 것부터
export function AdminInquiries() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("open");
  const [items, setItems] = useState<InquiryItem[] | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback((f: string) => {
    api<{ inquiries: InquiryItem[]; open: number }>(`/api/admin/inquiries?status=${f}`)
      .then((r) => { setItems(r.inquiries); setOpenCount(r.open); setErr(null); })
      .catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(filter); }, [filter, load]);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-[24px] font-extrabold">문의 관리</h1>
        <p className="mt-1 text-[14px] text-subtle">답장하면 문의한 사람에게 알림이 가요. 답변 대기 {openCount}건</p>
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
      {items === null && !err ? <div className="h-32 animate-pulse rounded-2xl bg-fill" /> : items?.length === 0 ? (
        <p className="rounded-2xl bg-surface p-6 text-center text-[14px] text-subtle shadow-sm ring-1 ring-line">
          {filter === "open" ? "답할 문의가 없어요." : "문의가 없어요."}
        </p>
      ) : (
        <ul className="space-y-3">
          {items?.map((q) => (
            <InquiryCard key={q.id} q={q}>
              <p className="mt-2 text-[12px] text-subtle">보낸 사람 {q.email}</p>
              <ReplyBox q={q} onDone={(nq) => {
                setItems((s) => (filter === "open" ? s?.filter((x) => x.id !== nq.id) : s?.map((x) => (x.id === nq.id ? nq : x))) ?? null);
                if (!q.reply) setOpenCount((n) => Math.max(0, n - 1));
              }} />
            </InquiryCard>
          ))}
        </ul>
      )}
    </div>
  );
}
