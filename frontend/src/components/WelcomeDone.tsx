"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { takePending } from "@/lib/consent";
import { LogoMark } from "./Logo";

// 로그인 직후: 로그인 전에 고른 동의를 서버에 저장하고, 동의가 끝났으면 앱으로, 아니면 동의 화면으로
export function WelcomeDone() {
  const router = useRouter();
  const raw = useSearchParams().get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  useEffect(() => {
    (async () => {
      const me = await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ user: null }));
      if (!me.user) return router.replace("/welcome");
      const pending = takePending();
      if (pending) {
        const r = await fetch("/api/consents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pending) });
        if (r.ok) return router.replace(next);
      }
      if (me.user.consented) return router.replace(next);
      router.replace(`/welcome/agree?next=${encodeURIComponent(next)}`);
    })();
  }, [router, next]);
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-[#f4f1ec]">
      <div className="flex flex-col items-center gap-3 text-[15px] font-bold text-muted">
        <span className="animate-pulse"><LogoMark size={40} /></span>
        준비하고 있어요…
      </div>
    </div>
  );
}
