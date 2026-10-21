"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Button, Notice } from "./ui";

export function LoginForm() {
  const router = useRouter();
  const next = useSearchParams().get("next") || "/my";
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
    <div className="mx-auto max-w-sm space-y-6 pt-6">
      <h1 className="text-[26px] font-extrabold">{mode === "login" ? "로그인" : "회원가입"}</h1>
      <p className="text-[14px] text-subtle">로그인하면 조회한 빈집을 관심자산으로 저장하고 새 지원사업 알림을 받을 수 있어요. 계정 연결은 실제 소유권 인증이 아니에요.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-[14px] font-bold">이메일
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block h-12 w-full rounded-xl bg-fill px-4 text-[16px] outline-none focus:ring-2 focus:ring-brand" />
        </label>
        <label className="block text-[14px] font-bold">비밀번호(8자 이상)
          <input type="password" required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block h-12 w-full rounded-xl bg-fill px-4 text-[16px] outline-none focus:ring-2 focus:ring-brand" />
        </label>
        {error && <Notice tone="bad">{error}</Notice>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>{busy ? "처리 중…" : mode === "login" ? "로그인" : "가입하고 로그인"}</Button>
      </form>
      <button className="text-[14px] font-bold text-brand" onClick={() => setMode(mode === "login" ? "signup" : "login")}>
        {mode === "login" ? "처음이세요? 회원가입" : "이미 계정이 있어요"}
      </button>
    </div>
  );
}
