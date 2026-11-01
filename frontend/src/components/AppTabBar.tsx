"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { TABS } from "@/lib/site";
import { AppIcon } from "./AppIcon";

// 휴대폰 하단 탭. 주소 입력·질문 단계와 로그인 화면에서는 숨겨 집중하게 한다.
export function AppTabBar() {
  const path = usePathname();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    const on = (e: Event) => setUnread((e as CustomEvent<number>).detail ?? 0);
    window.addEventListener("unread-count", on);
    return () => window.removeEventListener("unread-count", on);
  }, []);
  if (path.startsWith("/analyze") || path.startsWith("/login")) return null;
  return (
    <nav aria-label="하단 메뉴" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map((t) => {
          const on = t.match(path);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={on ? "page" : undefined}
                className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-bold ${on ? "text-ink" : "text-subtle"}`}>
                <AppIcon name={t.icon} active={on} />
                {t.label}
                {t.href === "/notifications" && unread > 0 && (
                  <span className="absolute right-[22%] top-1.5 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] leading-4 text-white" aria-label={`읽지 않은 알림 ${unread}개`}>{unread}</span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
