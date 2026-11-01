"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { SITE, TABS } from "@/lib/site";
import { LogoMark } from "./Logo";

// 상단 바: 로고와 로그인 상태만. 넓은 화면에서는 탭 메뉴도 여기에.
export function SiteHeader() {
  const path = usePathname();
  const [user, setUser] = useState<{ email: string } | null | undefined>(undefined);
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setUser(d.user ?? null)).catch(() => alive && setUser(null));
    const loadUnread = () => fetch("/api/notifications/unread", { cache: "no-store" }).then((r) => r.json()).then((d) => alive && setUnread(d.count ?? 0)).catch(() => {});
    loadUnread();
    window.addEventListener("notifications-read", loadUnread);
    return () => { alive = false; window.removeEventListener("notifications-read", loadUnread); };
  }, [path]);
  useEffect(() => { window.dispatchEvent(new CustomEvent("unread-count", { detail: unread })); }, [unread]);

  return (
    <header className="sticky top-0 z-30 bg-surface/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[18px] font-extrabold tracking-tight">
          <LogoMark />
          <span className="text-[#c9483b]">{SITE.name}</span>
        </Link>
        <nav aria-label="주 메뉴" className="hidden items-center gap-1 md:flex">
          {TABS.slice(1).map((t) => (
            <Link key={t.href} href={t.href} aria-current={t.match(path) ? "page" : undefined}
              className={`relative rounded-lg px-3 py-2 text-[15px] font-bold ${t.match(path) ? "text-ink" : "text-muted hover:text-ink"}`}>
              {t.label}
              {t.href === "/notifications" && unread > 0 && <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] text-white">{unread}</span>}
            </Link>
          ))}
        </nav>
        {user === undefined ? <span className="h-8 w-16" aria-hidden /> : user ? (
          <Link href="/more" className="grid h-9 w-9 place-items-center rounded-full bg-sign text-[14px] font-extrabold text-white md:hidden" aria-label={`내 계정 ${user.email}`}>
            {user.email[0]?.toUpperCase()}
          </Link>
        ) : (
          <Link href={`/login?next=${encodeURIComponent(path)}`} className="rounded-full bg-fill px-3.5 py-1.5 text-[14px] font-bold md:hidden">로그인</Link>
        )}
      </div>
      <div className="brick-strip" aria-hidden />
    </header>
  );
}
