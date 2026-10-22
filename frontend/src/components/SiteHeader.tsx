"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { NAV, SITE } from "@/lib/site";
import { LogoMark } from "./Logo";

export function SiteHeader() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const active = (m: string) => path === m || path.startsWith(`${m}/`) || (m === "/analyze" && path.startsWith("/analyses"));
  return (
    <header className="sticky top-0 z-30 bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2 text-[17px] font-extrabold tracking-tight text-ink" onClick={() => setOpen(false)}>
          <LogoMark />
          <span className="text-[#c9483b]">{SITE.name}</span>
          <span className="hidden text-[13px] font-semibold text-subtle sm:inline">{SITE.tagline}</span>
        </Link>
        <nav aria-label="주 메뉴" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active(n.match) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-[15px] font-bold transition ${active(n.match) ? "text-brand-strong" : "text-muted hover:bg-fill hover:text-ink"}`}
            >
              {n.label}
            </Link>
          ))}

        </nav>
        <button
          type="button"
          className="grid h-10 w-10 place-items-center rounded-lg hover:bg-fill md:hidden"
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>
      <div className="brick-strip" aria-hidden />
      {open && (
        <nav id="mobile-nav" aria-label="주 메뉴" className="border-t border-line bg-surface px-4 pb-4 md:hidden">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setOpen(false)}
              aria-current={active(n.match) ? "page" : undefined}
              className={`flex h-12 items-center justify-between border-b border-line text-[16px] font-bold ${active(n.match) ? "text-brand-strong" : "text-ink"}`}
            >
              {n.label}
              <span aria-hidden className="text-subtle">›</span>
            </Link>
          ))}

        </nav>
      )}
    </header>
  );
}
