"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isMemberPath, isPublicPath } from "@/lib/consent";

// 화면 잠금: 회원 전용 화면(내 자산·알림·문의)은 로그인으로, 로그인했는데 필수 동의를 안 했으면 동의 화면으로(서버 API도 같은 규칙)
export function MemberGate() {
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (isPublicPath(path)) return;
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (!alive) return;
      const here = encodeURIComponent(path + window.location.search);
      if (!d.user) { if (isMemberPath(path)) router.replace(`/login?next=${here}`); }
      else if (!d.user.consented) router.replace(`/welcome/agree?next=${here}`);
    }).catch(() => {});
    return () => { alive = false; };
  }, [path, router]);
  return null;
}
