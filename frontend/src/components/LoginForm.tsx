"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Notice } from "./ui";
import { LogoMark } from "./Logo";

const ERRORS: Record<string, string> = {
  google_not_configured: "구글 로그인이 아직 설정되지 않았어요(서버의 GOOGLE_CLIENT_ID·GOOGLE_CLIENT_SECRET 필요).",
  google_cancelled: "구글 로그인을 취소했어요.",
  google_failed: "구글 로그인 확인에 실패했어요. 다시 시도해 주세요.",
};

function safeNext(v: string | null) {
  return v && v.startsWith("/") && !v.startsWith("//") ? v : "/welcome/done";
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [google, setGoogle] = useState<boolean | null>(null);
  const [showEmail, setShowEmail] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(() => ERRORS[params.get("error") ?? ""] ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/auth/config").then((r) => r.json()).then((d) => setGoogle(!!d.google)).catch(() => setGoogle(false));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await api("/api/auth/signup", { method: "POST", body: { email, password } });
      await api("/api/auth/login", { method: "POST", body: { email, password } });
      router.push(next);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-y-auto bg-[#f4f1ec] pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 shrink-0 items-center px-2">
        <button type="button" onClick={() => (window.history.length > 1 ? router.back() : router.replace("/welcome"))} aria-label="뒤로"
          className="press grid h-11 w-11 place-items-center rounded-full">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
      </div>
      <div className="page-in mx-auto flex w-full max-w-sm flex-1 flex-col px-5 pb-6">
      <div className="mt-6 flex flex-1 flex-col justify-center space-y-6">
      <div>
        <span className="grid h-16 w-16 place-items-center rounded-[22px] bg-surface shadow-sm ring-1 ring-line"><LogoMark size={34} /></span>
        <h1 className="mt-5 text-[28px] font-extrabold leading-tight tracking-tight">로그인하고<br />시작해요</h1>
        <p className="mt-2 text-[15px] text-muted">관심 집을 저장하고 가격이 바뀌면 알림을 받을 수 있어요.</p>
      </div>

      {error && <Notice tone="bad">{error}</Notice>}

      <a
        href={google ? `/api/auth/google/start?next=${encodeURIComponent(next)}` : undefined}
        aria-disabled={!google}
        className={`press flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-surface text-[16px] font-bold text-ink shadow-sm ring-1 ring-line transition ${google ? "hover:bg-fill" : "pointer-events-none opacity-50"}`}
      >
        <svg aria-hidden width="20" height="20" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
          <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
          <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
        </svg>
        Google로 계속하기
      </a>
      {google === false && <p className="text-[12px] text-subtle">구글 로그인은 서버 설정 후 사용할 수 있어요.</p>}

      <div>
        <button type="button" className="text-[13px] font-bold text-subtle underline" onClick={() => setShowEmail((v) => !v)} aria-expanded={showEmail}>
          {showEmail ? "이메일 로그인 닫기" : "이메일로 로그인"}
        </button>
        {showEmail && (
          <form onSubmit={submit} className="mt-3 space-y-3">
            <label className="block text-[14px] font-bold">이메일
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block h-12 w-full rounded-xl bg-fill px-4 text-[16px] outline-none focus:ring-2 focus:ring-brand" />
            </label>
            <label className="block text-[14px] font-bold">비밀번호(8자 이상)
              <input type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block h-12 w-full rounded-xl bg-fill px-4 text-[16px] outline-none focus:ring-2 focus:ring-brand" />
            </label>
            <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 로그인"}</Button>
            <button type="button" className="text-[14px] font-bold text-brand-strong" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
              {mode === "login" ? "처음이세요? 회원가입" : "이미 계정이 있어요"}
            </button>
          </form>
        )}
      </div>
      </div>
      </div>
    </div>
  );
}
