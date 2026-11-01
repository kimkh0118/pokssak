"use client";

import { useEffect, useRef, useState } from "react";
import type { ToastMsg } from "@/lib/toast";

// 토스트 표시: 하단 탭 바로 위에 하나씩. 새 토스트가 오면 이전 것을 바꾼다. 되돌리기 같은 동작 버튼을 붙일 수 있다.
export function Toaster() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const [leaving, setLeaving] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
    const on = (e: Event) => {
      const m = (e as CustomEvent<ToastMsg>).detail;
      clear();
      setLeaving(false);
      setMsg(m);
      const stay = m.action ? 5000 : 2600;
      timers.current.push(window.setTimeout(() => setLeaving(true), stay));
      timers.current.push(window.setTimeout(() => setMsg((cur) => (cur?.id === m.id ? null : cur)), stay + 220));
    };
    window.addEventListener("app-toast", on);
    return () => { clear(); window.removeEventListener("app-toast", on); };
  }, []);

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4 md:bottom-6">
      {msg && (
        <div key={msg.id} role="status"
          className={`toast pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-[14px] font-semibold text-white shadow-[0_10px_30px_-8px_rgba(12,13,17,.45)] ${msg.tone === "bad" ? "bg-bad" : "bg-ink/95"} ${leaving ? "toast-out" : ""}`}>
          <span className="min-w-0">{msg.text}</span>
          {msg.action && (
            <button type="button" className="press -my-1 shrink-0 rounded-lg px-2 py-1 font-bold text-[#ffc89f]"
              onClick={async () => { const a = msg.action!; setLeaving(true); await a.run(); }}>{msg.action.label}</button>
          )}
        </div>
      )}
    </div>
  );
}
