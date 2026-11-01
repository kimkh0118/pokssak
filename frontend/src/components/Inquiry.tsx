"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, type User } from "@/lib/api";
import { toast } from "@/lib/toast";
import { Notice } from "./ui";

export type InquiryItem = {
  id: string; email: string; category: string; title: string; body: string;
  createdAt: string; reply: string | null; repliedAt: string | null;
};

const CATEGORIES = ["이용 문의", "오류 신고", "기능 제안", "기타"];

export const fmtDate = (s: string) => new Date(s).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

export function StatusPill({ answered }: { answered: boolean }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-bold ${answered ? "bg-[#e7f6ee] text-good" : "bg-fill text-muted"}`}>
      {answered ? "답변 완료" : "답변 대기"}
    </span>
  );
}

/** 종류별 보기: 기타에서 직접 적은 종류는 '기타'로 묶는다 */
export const TYPE_FILTERS = ["전체", "이용 문의", "오류 신고", "기능 제안", "기타"];
export function typeOf(category: string) {
  return CATEGORIES.slice(0, 3).includes(category) ? category : "기타";
}

export function TypeChips({ value, onChange, items }: { value: string; onChange: (v: string) => void; items: InquiryItem[] | null }) {
  return (
    <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4" role="group" aria-label="문의 종류로 보기">
      {TYPE_FILTERS.map((t) => {
        const n = t === "전체" ? items?.length ?? 0 : items?.filter((q) => typeOf(q.category) === t).length ?? 0;
        return (
          <button key={t} type="button" aria-pressed={value === t}
            onClick={(e) => { onChange(t); e.currentTarget.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" }); }}
            className={`press shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-bold ring-1 transition-colors duration-150 ${value === t ? "bg-sign text-white ring-sign" : "bg-surface text-muted ring-line"}`}>
            {t}{items && n > 0 ? <span className={`ml-1 tabular ${value === t ? "text-white/80" : "text-subtle"}`}>{n}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/** 목록의 한 줄: 제목·종류·날짜·상태. 누르면 상세로 */
export function InquiryRow({ q, showEmail }: { q: InquiryItem; showEmail?: boolean }) {
  return (
    <li>
      <Link href={`/inquiry/${q.id}`} className="press block rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 truncate text-[16px] font-bold">{q.title}</p>
          <StatusPill answered={!!q.reply} />
        </div>
        <p className="mt-1 truncate text-[13px] text-subtle">
          {q.category} · {fmtDate(q.createdAt)}{showEmail ? ` · ${q.email}` : ""}
        </p>
      </Link>
    </li>
  );
}

// 내 문의 목록
export function InquiryList() {
  const [items, setItems] = useState<InquiryItem[] | null>(null);
  const [type, setType] = useState("전체");
  const shown = type === "전체" ? items : items?.filter((q) => typeOf(q.category) === type) ?? null;
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ inquiries: InquiryItem[] }>("/api/inquiries").then((r) => setItems(r.inquiries)).catch((e) => setErr(e.message));
  }, []);
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <h1 className="text-[24px] font-extrabold">문의하기</h1>
        <p className="mt-1 text-[14px] text-subtle">궁금한 점이나 오류를 남기면 운영자가 답해요. 답장이 오면 알림으로 알려드려요.</p>
      </div>
      <Link href="/inquiry/new" className="press flex h-13 items-center justify-center rounded-2xl bg-brand py-3.5 text-[16px] font-bold text-white shadow-[0_8px_20px_-10px_rgba(169,93,46,.8)]">
        새 문의 쓰기
      </Link>
      <section>
        <h2 className="text-[17px] font-extrabold">내 문의</h2>
        {!!items?.length && <div className="mt-3"><TypeChips value={type} onChange={setType} items={items} /></div>}
        {err && <div className="mt-3"><Notice tone="bad">{err}</Notice></div>}
        {items === null && !err ? <div className="mt-3 h-20 animate-pulse rounded-2xl bg-fill" /> : items?.length === 0 ? (
          <p className="mt-3 rounded-2xl bg-surface p-6 text-center text-[14px] text-subtle shadow-sm ring-1 ring-line">아직 남긴 문의가 없어요.</p>
        ) : (
          shown?.length === 0
            ? <p className="mt-3 text-center text-[14px] text-subtle">{type} 문의가 없어요.</p>
            : <ul key={type} className="stagger mt-3 space-y-2">{shown?.map((q) => <InquiryRow key={q.id} q={q} />)}</ul>
        )}
      </section>
    </div>
  );
}

// 새 문의: 종류(기타면 직접 입력) · 제목 · 내용
export function InquiryNew() {
  const router = useRouter();
  const [cat, setCat] = useState("");
  const [custom, setCustom] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ready = !!cat && (cat !== "기타" || custom.trim().length >= 2) && title.trim().length >= 2 && body.trim().length >= 5;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setBusy(true); setErr(null);
    try {
      const q = await api<InquiryItem>("/api/inquiries", { method: "POST", body: { category: cat, custom, title, body } });
      toast("문의를 보냈어요");
      router.replace(`/inquiry/${q.id}?sent=1`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  }

  const input = "mt-2 block w-full rounded-xl bg-fill px-3.5 text-[15px] font-normal outline-none focus:ring-2 focus:ring-brand";
  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5">
      <h1 className="text-[24px] font-extrabold">새 문의</h1>
      <fieldset>
        <legend className="text-[14px] font-bold">문의 종류</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)}
              className={`press rounded-full px-4 py-2 text-[14px] font-bold ring-1 ${cat === c ? "bg-ink text-white ring-ink" : "bg-surface text-muted ring-line"}`}>{c}</button>
          ))}
        </div>
        {cat === "기타" && (
          <label className="mt-3 block text-[13px] font-bold text-muted">어떤 문의인가요?
            <input value={custom} onChange={(e) => setCustom(e.target.value)} maxLength={20} autoFocus placeholder="예: 제휴 제안, 자료 정정 요청"
              className={`${input} h-11`} />
          </label>
        )}
      </fieldset>
      <label className="block text-[14px] font-bold">제목
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={60} placeholder="한 줄로 요약해 주세요" className={`${input} h-12`} />
      </label>
      <label className="block text-[14px] font-bold">내용
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} maxLength={2000}
          placeholder="언제, 어떤 화면에서, 무엇이 문제였는지 적어 주면 빨리 도와드릴 수 있어요."
          className={`${input} resize-none py-3 leading-relaxed`} />
        <span className="mt-1 block text-right text-[12px] font-normal text-subtle tabular">{body.length} / 2000</span>
      </label>
      {err && <Notice tone="bad">{err}</Notice>}
      <button type="submit" disabled={!ready || busy}
        className="press h-13 w-full rounded-2xl bg-brand py-3.5 text-[16px] font-bold text-white transition-opacity disabled:opacity-40">
        {busy ? "보내는 중…" : "문의 보내기"}
      </button>
    </form>
  );
}

// 문의 상세: 내 질문(오른쪽) ↔ 운영자 답변(왼쪽) 대화 모양. 관리자는 아래에서 답장
export function InquiryDetail({ id }: { id: string; sent?: boolean }) {
  const [q, setQ] = useState<InquiryItem | null>(null);
  const [me, setMe] = useState<User | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<InquiryItem>(`/api/inquiries/${id}`).then(setQ).catch((e) => setErr(e.message));
    api<{ user: User | null }>("/api/auth/me").then((r) => setMe(r.user)).catch(() => {});
  }, [id]);

  if (err) return <div className="mx-auto max-w-md"><Notice tone="bad">{err}</Notice></div>;
  if (!q) return <div className="mx-auto h-40 max-w-md animate-pulse rounded-2xl bg-fill" />;
  const admin = !!me?.isAdmin;
  return (
    <div className="mx-auto max-w-md space-y-5">
      <div>
        <div className="flex items-center gap-2"><span className="text-[13px] font-bold text-subtle">{q.category}</span><StatusPill answered={!!q.reply} /></div>
        <h1 className="mt-1.5 text-[22px] font-extrabold leading-snug">{q.title}</h1>
        {admin && <p className="mt-1 text-[13px] text-subtle">보낸 사람 {q.email}</p>}
      </div>

      <div className="space-y-3">
        <div className="ml-8 rounded-2xl rounded-tr-md bg-sign p-4 text-white">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{q.body}</p>
          <p className="mt-2 text-right text-[11px] text-white/70">{admin ? "문의" : "나"} · {fmtDate(q.createdAt)}</p>
        </div>
        {q.reply ? (
          <div className="mr-8 rounded-2xl rounded-tl-md bg-surface p-4 shadow-sm ring-1 ring-line">
            <p className="text-[12px] font-extrabold text-brand-strong">폭싹 운영자</p>
            <p className="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed">{q.reply}</p>
            <p className="mt-2 text-[11px] text-subtle">{fmtDate(q.repliedAt!)}</p>
          </div>
        ) : !admin && (
          <p className="text-center text-[13px] text-subtle">운영자가 확인하고 있어요. 답장이 오면 알려드릴게요.</p>
        )}
      </div>

      {admin && <ReplyBox q={q} onDone={setQ} />}
      <Link href={admin ? "/admin/inquiries" : "/inquiry"} className="block text-center text-[14px] font-bold text-subtle underline underline-offset-2">
        {admin ? "문의 관리로" : "내 문의 목록으로"}
      </Link>
    </div>
  );
}

function ReplyBox({ q, onDone }: { q: InquiryItem; onDone: (q: InquiryItem) => void }) {
  const [open, setOpen] = useState(!q.reply);
  const [text, setText] = useState(q.reply ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="w-full text-[14px] font-bold text-subtle underline">답장 고치기</button>;
  return (
    <form className="space-y-2 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line" onSubmit={async (e) => {
      e.preventDefault();
      setBusy(true); setErr(null);
      try {
        onDone(await api<InquiryItem>(`/api/admin/inquiries/${q.id}/reply`, { method: "POST", body: { reply: text } }));
        setOpen(false);
        toast("답장을 보냈어요 · 문의한 사람에게 알림이 갔어요");
      } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
    }}>
      <label className="text-[14px] font-bold" htmlFor="reply">{q.reply ? "답장 고치기" : "답장 쓰기"}</label>
      <textarea id="reply" value={text} onChange={(e) => setText(e.target.value)} rows={5} maxLength={2000} placeholder="답장을 적어 주세요"
        className="block w-full resize-none rounded-xl bg-fill p-3 text-[15px] leading-relaxed outline-none focus:ring-2 focus:ring-brand" />
      {err && <p role="alert" className="text-[13px] font-bold text-bad">{err}</p>}
      <button type="submit" disabled={busy || text.trim().length < 2}
        className="press h-12 w-full rounded-xl bg-ink text-[15px] font-bold text-white disabled:opacity-40">{busy ? "보내는 중…" : "답장 보내기"}</button>
      <p className="text-[12px] text-subtle">보내면 문의한 사람에게 ‘{q.title}’ 문의 답장 알림이 가요.</p>
    </form>
  );
}
