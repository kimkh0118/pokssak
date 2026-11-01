"use client";

// 화면 아래 잠깐 떴다 사라지는 안내(토스트). 어디서든 toast("저장했어요") 처럼 부른다.
export type ToastAction = { label: string; run: () => void | Promise<void> };
export type ToastMsg = { id: number; text: string; action?: ToastAction; tone?: "default" | "bad" };

let seq = 0;

export function toast(text: string, opts: { action?: ToastAction; tone?: "default" | "bad" } = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<ToastMsg>("app-toast", { detail: { id: ++seq, text, ...opts } }));
  haptic();
}

/** 안드로이드에서 아주 짧은 진동(아이폰 사파리는 지원 안 함 → 조용히 무시) */
export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch {}
}
