"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CONSENT_ITEMS, PRIVACY_SUMMARY, requiredDone, savePending, type Choices, afterConsent } from "@/lib/consent";

const NONE: Choices = { age14: false, terms: false, privacy: false, notify: false };

function Check({ on, big }: { on: boolean; big?: boolean }) {
  const s = big ? "h-7 w-7" : "h-6 w-6";
  return (
    <span aria-hidden className={`grid ${s} shrink-0 place-items-center rounded-full transition-colors duration-150 ${on ? "bg-brand" : "bg-fill-strong"}`}>
      <svg width={big ? 16 : 14} height={big ? 16 : 14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 12.5 4.5 4.5L19 7.5" className={on ? "check-on" : ""} />
      </svg>
    </span>
  );
}

// 동의 화면: 필수 3개 + 선택 1개. 로그인 전이면 고른 값을 잠시 두고 로그인으로, 로그인 뒤면 바로 서버에 저장
export function ConsentForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "";
  const [c, setC] = useState<Choices>(NONE);
  const [open, setOpen] = useState<"privacy" | null>(null);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const all = CONSENT_ITEMS.every((i) => c[i.key]);
  const ok = requiredDone(c);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => setLoggedIn(!!d.user)).catch(() => setLoggedIn(false));
  }, []);

  async function submit() {
    if (!ok) return;
    setBusy(true); setErr(null);
    const done = `/welcome/done${next ? `?next=${encodeURIComponent(next)}` : ""}`;
    if (!loggedIn) {
      savePending(c);
      router.push(`/login?next=${encodeURIComponent(done)}`);
      return;
    }
    const r = await fetch("/api/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(c) });
    if (r.ok) router.replace(afterConsent(next || "/"));
    else { setErr((await r.json().catch(() => ({}))).error ?? "저장하지 못했어요. 다시 시도해 주세요."); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f4f1ec] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center px-2">
        <button type="button" onClick={() => router.back()} aria-label="뒤로" className="press grid h-11 w-11 place-items-center rounded-full">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 page-in">
        <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">시작하기 전에<br />동의가 필요해요</h1>
        <p className="mt-2 text-[15px] text-muted">필수 항목에 동의하면 폭싹을 쓸 수 있어요.</p>

        <button type="button" onClick={() => setC(all ? NONE : { age14: true, terms: true, privacy: true, notify: true })} aria-pressed={all}
          className="press mt-6 flex w-full items-center gap-3 rounded-2xl bg-surface p-4 text-left shadow-sm ring-1 ring-line">
          <Check on={all} big />
          <span><b className="block text-[17px]">전체 동의하기</b><span className="text-[13px] text-subtle">선택 항목(가격 알림)도 함께 동의해요</span></span>
        </button>

        <ul className="mt-3 divide-y divide-line rounded-2xl bg-surface shadow-sm ring-1 ring-line">
          {CONSENT_ITEMS.map((it) => (
            <li key={it.key} className="flex items-center">
              <button type="button" role="checkbox" aria-checked={c[it.key]} onClick={() => setC({ ...c, [it.key]: !c[it.key] })}
                className="flex min-h-14 flex-1 items-center gap-3 px-4 py-3 text-left">
                <Check on={c[it.key]} />
                <span className="text-[15px] font-semibold">
                  <span className={it.required ? "text-brand-strong" : "text-subtle"}>[{it.required ? "필수" : "선택"}]</span> {it.label}
                </span>
              </button>
              {it.doc === "terms" && <Link href="/terms" className="px-4 py-3 text-[13px] font-bold text-subtle underline underline-offset-2">보기</Link>}
              {it.doc === "privacy" && <button type="button" onClick={() => setOpen("privacy")} className="px-4 py-3 text-[13px] font-bold text-subtle underline underline-offset-2">보기</button>}
            </li>
          ))}
        </ul>
        <p className="mt-3 px-1 text-[12px] leading-relaxed text-subtle">
          선택 항목은 동의하지 않아도 서비스를 쓸 수 있고, 알림은 더보기에서 언제든 끄고 켤 수 있어요. 동의는 회원 탈퇴로 철회할 수 있어요.
        </p>
        {err && <p role="alert" className="mt-3 text-[14px] font-bold text-bad">{err}</p>}
      </div>
      <div className="px-5 pb-5 pt-3">
        <button type="button" disabled={!ok || busy || loggedIn === null} onClick={() => void submit()}
          className="press h-14 w-full rounded-2xl bg-brand text-[17px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(169,93,46,.8)] transition-opacity disabled:opacity-40 disabled:shadow-none">
          {busy ? "저장 중…" : loggedIn ? "동의하고 시작하기" : "동의하고 로그인하기"}
        </button>
      </div>

      {open === "privacy" && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 sheet-fade" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal aria-label="개인정보 수집·이용 동의" onClick={(e) => e.stopPropagation()}
            className="sheet-up max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-3">
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-fill-strong" aria-hidden />
            <h2 className="text-[20px] font-extrabold">개인정보 수집·이용 동의</h2>
            <dl className="mt-4 space-y-3">
              {PRIVACY_SUMMARY.map((r) => (
                <div key={r.title} className="rounded-xl bg-fill p-3.5">
                  <dt className="text-[13px] font-extrabold text-muted">{r.title}</dt>
                  <dd className="mt-1 text-[14px] leading-relaxed">{r.body}</dd>
                </div>
              ))}
            </dl>
            <Link href="/privacy" className="mt-3 inline-block text-[13px] font-bold text-subtle underline underline-offset-2">개인정보처리방침 전문 보기</Link>
            <button type="button" onClick={() => { setC({ ...c, privacy: true }); setOpen(null); }}
              className="press mt-4 h-13 w-full rounded-2xl bg-ink py-4 text-[16px] font-bold text-white">동의하고 닫기</button>
          </div>
        </div>
      )}
    </div>
  );
}
