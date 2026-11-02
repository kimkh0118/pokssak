"use client";

// 동의 항목(서버 backend/app/consents.py 와 같은 키). 로그인 전에 고른 동의는 잠시 기기에 두었다가 로그인 직후 서버에 저장한다.
export type ConsentKey = "age14" | "terms" | "privacy" | "notify";
export type Choices = Record<ConsentKey, boolean>;

export const CONSENT_ITEMS: { key: ConsentKey; label: string; required: boolean; doc?: "terms" | "privacy" }[] = [
  { key: "age14", label: "만 14세 이상이에요", required: true },
  { key: "terms", label: "서비스 이용약관 동의", required: true, doc: "terms" },
  { key: "privacy", label: "개인정보 수집·이용 동의", required: true, doc: "privacy" },
  { key: "notify", label: "내 자산 가격 변동 알림 받기", required: false },
];

/** 개인정보 수집·이용 동의 화면에 그대로 보여주는 요약(개인정보처리방침과 같은 내용) */
export const PRIVACY_SUMMARY = [
  { title: "수집 항목", body: "이메일, 구글 계정 식별값(구글 로그인 시), 비밀번호 해시(이메일 가입 시), 조회한 주소·답변·집 상태 설명·입력 금액, 내 자산, 알림 받을 기기 정보" },
  { title: "이용 목적", body: "로그인, 처리 방안 비교 계산과 결과 저장, 집 상태 점수 산정(설명은 AI 서비스 Anthropic으로 전송될 수 있음), 내 자산 가격 변동 알림" },
  { title: "보유 기간", body: "회원 탈퇴 때까지. 탈퇴하면 바로 지워요(더보기 → 회원 탈퇴)." },
  { title: "동의 거부", body: "동의하지 않을 수 있어요. 다만 필수 항목에 동의하지 않으면 서비스를 이용할 수 없어요." },
];

const KEY = "pending-consents";

export function savePending(c: Choices) {
  try { sessionStorage.setItem(KEY, JSON.stringify(c)); } catch {}
}

export function takePending(): Choices | null {
  try {
    const v = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return v ? (JSON.parse(v) as Choices) : null;
  } catch {
    return null;
  }
}

export function requiredDone(c: Partial<Choices>) {
  return CONSENT_ITEMS.every((i) => !i.required || c[i.key]);
}

/** 로그인 없이 들어올 수 있는 화면 */
export const PUBLIC_PATHS = ["/welcome", "/login", "/terms", "/privacy"];
export const isPublicPath = (p: string) => PUBLIC_PATHS.some((x) => p === x || p.startsWith(x + "/"));

/** 처음 가입·동의를 마친 직후 한 번은 알림 안내 화면을 거친다(이미 '다음에'를 눌렀거나 봤으면 바로 이동) */
export function afterConsent(next: string) {
  try {
    if (localStorage.getItem("notify-later") || localStorage.getItem("notify-primed")) return next;
    localStorage.setItem("notify-primed", "1");
  } catch {
    return next;
  }
  return `/notify?next=${encodeURIComponent(next)}`;
}
