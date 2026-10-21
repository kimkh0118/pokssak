"use client";

import { useState } from "react";

/** 현재 결과 주소 복사. 결과 주소를 아는 사람은 결과를 볼 수 있다는 점을 함께 알린다. */
export function ShareButton() {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <button
      type="button"
      title="결과 주소를 아는 사람은 이 결과를 볼 수 있어요"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 2000);
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-full bg-fill px-3.5 text-[13px] font-bold text-muted hover:bg-fill-strong hover:text-ink"
    >
      <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
        <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
      </svg>
      <span aria-live="polite">{state === "copied" ? "링크 복사됨" : state === "failed" ? "복사 실패" : "링크 복사"}</span>
    </button>
  );
}
