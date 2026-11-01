"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Notice } from "./ui";

export type InquiryItem = { id: string; email: string; category: string; body: string; createdAt: string; reply: string | null; repliedAt: string | null };

export const fmtDate = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export function StatusPill({ answered }: { answered: boolean }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${answered ? "bg-[#e7f6ee] text-good" : "bg-fill text-muted"}`}>
      {answered ? "답변 완료" : "답변 대기"}
    </span>
  );
}

/** 문의 한 건: 내 문의 + (있으면) 운영자 답장 말풍선 */
export function InquiryCard({ q, children }: { q: InquiryItem; children?: React.ReactNode }) {
  return (
    <li className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[13px] font-bold text-subtle">{q.category} · {fmtDate(q.createdAt)}</p>
        <StatusPill answered={!!q.reply} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{q.body}</p>
      {q.reply && (
        <div className="mt-3 rounded-xl bg-brand-soft p-3">
          <p className="text-[12px] font-extrabold text-brand-strong">폭싹 답변 · {fmtDate(q.repliedAt!)}</p>
          <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed">{q.reply}</p>
        </div>
      )}
      {children}
    </li>
  );
}

// 문의하기: 종류 고르고 내용 쓰기 → 내 문의와 답장 목록
export function Inquiry() {
  const [items, setItems] = useState<InquiryItem[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [cat, setCat] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    api<{ inquiries: InquiryItem[]; categories: string[] }>("/api/inquiries")
      .then((r) => { setItems(r.inquiries); setCats(r.categories); })
      .catch((e) => setErr(e.message));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setSent(false);
    try {
      const q = await api<InquiryItem>("/api/inquiries", { method: "POST", body: { category: cat, body } });
      setItems((s) => [q, ...(s ?? [])]);
      setBody(""); setCat(""); setSent(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-[24px] font-extrabold">문의하기</h1>
        <p className="mt-1 text-[14px] text-subtle">궁금한 점이나 오류를 남겨 주세요. 답장이 오면 알림으로 알려드려요.</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
        <fieldset>
          <legend className="text-[14px] font-bold">문의 종류</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {cats.map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
                className={`press rounded-full px-3.5 py-2 text-[14px] font-bold ring-1 ${cat === c ? "bg-ink text-white ring-ink" : "bg-surface text-muted ring-line"}`}>{c}</button>
            ))}
          </div>
        </fieldset>
        <label className="block text-[14px] font-bold">내용
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={2000} required
            placeholder="예: 주소를 넣었는데 다음 단계로 넘어가지 않아요."
            className="mt-2 block w-full resize-none rounded-xl bg-fill p-3 text-[15px] font-normal leading-relaxed outline-none focus:ring-2 focus:ring-brand" />
          <span className="mt-1 block text-right text-[12px] font-normal text-subtle tabular">{body.length} / 2000</span>
        </label>
        {err && <Notice tone="bad">{err}</Notice>}
        {sent && <p role="status" className="text-[14px] font-bold text-good">문의를 보냈어요. 답장이 오면 알려드릴게요.</p>}
        <button type="submit" disabled={busy || !cat || body.trim().length < 5}
          className="press h-12 w-full rounded-xl bg-brand text-[16px] font-bold text-white disabled:opacity-40">{busy ? "보내는 중…" : "문의 보내기"}</button>
      </form>

      <section>
        <h2 className="text-[17px] font-extrabold">내 문의</h2>
        {items === null ? <div className="mt-3 h-24 animate-pulse rounded-2xl bg-fill" /> : items.length === 0 ? (
          <p className="mt-2 text-[14px] text-subtle">아직 남긴 문의가 없어요.</p>
        ) : (
          <ul className="mt-3 space-y-2">{items.map((q) => <InquiryCard key={q.id} q={q} />)}</ul>
        )}
      </section>
    </div>
  );
}
