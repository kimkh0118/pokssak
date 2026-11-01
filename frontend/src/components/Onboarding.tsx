"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LogoMark } from "./Logo";

// 처음 여는 사람에게 보여주는 소개 3장 → 동의 → 로그인
const SLIDES = [
  { art: "sign", title: "주소 하나로 시작해요", body: "도로명이나 지번만 넣으면 공공자료로 집값·땅값·철거비를 바로 계산해요." },
  { art: "compare", title: "그대로 팔까,\n철거하고 팔까", body: "비용을 다 빼고 손에 남는 돈을 나란히 놓고 비교해 드려요." },
  { art: "bell", title: "가격이 바뀌면\n먼저 알려드려요", body: "관심 집의 예상 가격이 3% 넘게 바뀌거나 새 공시가격이 나오면 휴대폰으로 알려드려요." },
] as const;

function Art({ kind }: { kind: (typeof SLIDES)[number]["art"] }) {
  if (kind === "sign")
    return (
      <div className="road-sign bg-sign p-[5px] pr-[26px] drop-shadow-[0_10px_24px_rgba(44,47,128,.35)]">
        <div className="road-sign rounded-l-[6px] border-[2.5px] border-r-0 border-white px-4 py-3 pr-8">
          <p className="text-[30px] font-bold leading-none tracking-tight text-white">반송동 250</p>
          <p className="mt-1.5 text-[11px] font-medium text-white/75">Enter the address</p>
        </div>
      </div>
    );
  if (kind === "compare")
    return (
      <div className="flex w-64 items-end justify-center gap-6">
        {[{ h: 120, c: "bg-sign", l: "그대로", v: "1.2억" }, { h: 168, c: "bg-brand", l: "철거 후", v: "1.6억" }].map((b, i) => (
          <div key={b.l} className="flex flex-col items-center gap-2">
            <span className="text-[15px] font-extrabold tabular">{b.v}</span>
            <span className={`onb-bar w-20 rounded-t-xl ${b.c}`} style={{ height: b.h, animationDelay: `${0.1 + i * 0.12}s` }} />
            <span className="text-[13px] font-bold text-muted">{b.l}</span>
          </div>
        ))}
      </div>
    );
  return (
    <div className="relative grid h-40 w-40 place-items-center rounded-[40px] bg-surface shadow-[0_12px_30px_-10px_rgba(60,40,30,.25)] ring-1 ring-line">
      <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#c9483b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="onb-ring">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span className="absolute -right-3 -top-3 rounded-full bg-bad px-2.5 py-1 text-[13px] font-extrabold text-white shadow">+3.4%</span>
    </div>
  );
}

export function Onboarding() {
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "";
  const track = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const agreeHref = `/welcome/agree${next ? `?next=${encodeURIComponent(next)}` : ""}`;
  // 이미 가입한 사람은 로그인부터: 로그인 뒤 서버에 동의 기록이 없으면 동의 화면으로 보낸다
  const loginHref = `/login?next=${encodeURIComponent(`/welcome/done${next ? `?next=${encodeURIComponent(next)}` : ""}`)}`;

  // 이미 로그인·동의를 마쳤으면 소개를 건너뛴다
  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (d.user?.consented) router.replace(next || "/");
      else if (d.user) router.replace(agreeHref);
    }).catch(() => {});
  }, [router, next, agreeHref]);

  function go(n: number) {
    const el = track.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-[#f4f1ec] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between px-5">
        <span className="flex items-center gap-1.5 text-[17px] font-extrabold text-[#c9483b]"><LogoMark size={20} />폭싹</span>
        {!last && <Link href={agreeHref} className="px-1 py-2 text-[14px] font-bold text-subtle">건너뛰기</Link>}
      </div>

      <div ref={track} onScroll={(e) => setI(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="no-scrollbar flex flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-contain" aria-roledescription="소개 슬라이드">
        {SLIDES.map((s, n) => (
          <section key={s.title} aria-label={`${n + 1} / ${SLIDES.length}`} className="flex w-full shrink-0 snap-center flex-col px-7">
            <div className="grid flex-1 place-items-center">{i === n || Math.abs(i - n) === 1 ? <div key={i === n ? "on" : "off"} className={i === n ? "onb-pop" : ""}><Art kind={s.art} /></div> : null}</div>
            <div className="pb-6">
              <h1 className="whitespace-pre-line text-[28px] font-extrabold leading-[1.25] tracking-tight">{s.title}</h1>
              <p className="mt-3 text-[16px] leading-relaxed text-muted">{s.body}</p>
            </div>
          </section>
        ))}
      </div>

      <div className="px-5 pb-5">
        <div className="mb-5 flex justify-center gap-1.5" aria-hidden>
          {SLIDES.map((_, n) => <span key={n} className={`h-1.5 rounded-full transition-all duration-300 ${n === i ? "w-6 bg-ink" : "w-1.5 bg-fill-strong"}`} />)}
        </div>
        {last ? (
          <Link href={agreeHref} className="press flex h-14 w-full items-center justify-center rounded-2xl bg-brand text-[17px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(169,93,46,.8)]">시작하기</Link>
        ) : (
          <button type="button" onClick={() => go(i + 1)} className="press h-14 w-full rounded-2xl bg-ink text-[17px] font-bold text-white">다음</button>
        )}
        <p className="mt-3 text-center text-[13px] text-subtle">
          이미 계정이 있나요? <Link href={loginHref} className="font-bold text-ink underline underline-offset-2">로그인</Link>
        </p>
      </div>
    </div>
  );
}
