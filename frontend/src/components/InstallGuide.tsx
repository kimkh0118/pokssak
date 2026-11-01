"use client";

import { useState, useSyncExternalStore } from "react";
import { detectPlatform, INSTALL, PLATFORM_LABEL, UNBLOCK, type Platform } from "@/lib/device";

const noop = () => () => {};

const ORDER: Platform[] = ["ios-safari", "ios-other", "android", "samsung", "desktop-chrome", "edge", "mac-safari", "firefox", "inapp"];

function Steps({ guide }: { guide: { steps: React.ReactNode[]; note?: string } }) {
  return (
    <>
      <ol className="mt-2 space-y-2">
        {guide.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] leading-snug">
            <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sign text-[12px] font-extrabold text-white">{i + 1}</span>
            <span className="pt-0.5">{s}</span>
          </li>
        ))}
      </ol>
      {guide.note && <p className="mt-2 text-[12px] text-subtle">{guide.note}</p>}
    </>
  );
}

/** 지금 기기에 맞는 안내 + 다른 기기 안내로 바꿔 보기 */
export function DeviceGuide({ kind }: { kind: "install" | "unblock" }) {
  // 서버에서 미리 그릴 땐 기기를 모르므로 'other', 브라우저에서 실제 기기로 바뀐다
  const mine = useSyncExternalStore(noop, () => detectPlatform(), () => "other" as Platform);
  const [picked, setShown] = useState<Platform | null>(null);
  const shown = picked ?? mine;
  const table = kind === "install" ? INSTALL : UNBLOCK;
  return (
    <div>
      <p className="text-[12px] font-bold text-subtle">
        {shown === mine ? `지금 쓰는 ${PLATFORM_LABEL[mine]} 기준` : `${PLATFORM_LABEL[shown]} 안내`}
      </p>
      <Steps guide={table[shown]} />
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-bold text-muted">다른 기기·브라우저 안내 보기</summary>
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="기기 선택">
          {ORDER.map((p) => (
            <button key={p} type="button" aria-pressed={shown === p} onClick={() => setShown(p)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-bold ring-1 ${shown === p ? "bg-ink text-white ring-ink" : "bg-surface text-muted ring-line"}`}>
              {PLATFORM_LABEL[p]}{p === mine ? " (지금)" : ""}
            </button>
          ))}
        </div>
      </details>
    </div>
  );
}
