"use client";

// 지금 쓰는 기기·브라우저를 알아내서, 앱 설치·알림 안내를 그 환경에 맞게 보여준다.
export type Platform =
  | "ios-safari" | "ios-other" | "android" | "samsung"
  | "desktop-chrome" | "edge" | "mac-safari" | "firefox" | "inapp" | "other";

export const PLATFORM_LABEL: Record<Platform, string> = {
  "ios-safari": "아이폰 사파리",
  "ios-other": "아이폰 크롬·기타",
  android: "안드로이드 크롬",
  samsung: "삼성 인터넷",
  "desktop-chrome": "컴퓨터 크롬·웨일",
  edge: "컴퓨터 엣지",
  "mac-safari": "맥 사파리",
  firefox: "파이어폭스",
  inapp: "카카오톡·네이버 앱 안",
  other: "기타 브라우저",
};

export function detectPlatform(ua = typeof navigator === "undefined" ? "" : navigator.userAgent): Platform {
  if (/KAKAOTALK|NAVER\(|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i.test(ua)) return "inapp";
  const ios = /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|Whale/i.test(ua) ? "ios-other" : "ios-safari";
  if (/SamsungBrowser/i.test(ua)) return "samsung";
  if (/Android/i.test(ua)) return /Firefox/i.test(ua) ? "firefox" : "android";
  if (/Firefox/i.test(ua)) return "firefox";
  if (/Edg\//.test(ua)) return "edge";
  if (/Chrome|Chromium|Whale/i.test(ua)) return "desktop-chrome";
  if (/Macintosh/.test(ua) && /Safari/.test(ua)) return "mac-safari";
  return "other";
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || !!(navigator as unknown as { standalone?: boolean }).standalone;
}

type Guide = { steps: React.ReactNode[]; note?: string };

/** 앱(홈 화면) 설치 방법 */
export const INSTALL: Record<Platform, Guide> = {
  "ios-safari": {
    steps: ["화면 아래쪽 공유 버튼(□↑)을 눌러요.", "목록을 조금 내려 '홈 화면에 추가'를 눌러요.", "오른쪽 위 '추가'를 눌러요.", "홈 화면의 폭싹 아이콘으로 열어요."],
    note: "아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요.",
  },
  "ios-other": {
    steps: ["주소창 오른쪽의 공유 버튼(□↑)을 눌러요.", "'홈 화면에 추가'를 눌러요.", "오른쪽 위 '추가'를 눌러요.", "홈 화면의 폭싹 아이콘으로 열어요."],
    note: "공유 메뉴에 '홈 화면에 추가'가 없으면 사파리로 열어 주세요(iOS 16.4 이상).",
  },
  android: {
    steps: ["오른쪽 위 메뉴(⋮)를 눌러요.", "'앱 설치' 또는 '홈 화면에 추가'를 눌러요.", "'설치'를 눌러요.", "홈 화면의 폭싹 아이콘으로 열어요."],
  },
  samsung: {
    steps: ["주소창의 설치 아이콘(↓)이 보이면 눌러요. 없으면 아래쪽 메뉴(≡)를 눌러요.", "'현재 페이지 추가' → '홈 화면'을 눌러요.", "'추가'를 눌러요.", "홈 화면의 폭싹 아이콘으로 열어요."],
  },
  "desktop-chrome": {
    steps: ["주소창 오른쪽 끝의 설치 아이콘(모니터에 ↓)을 눌러요.", "'설치'를 눌러요.", "독(Dock)·시작 메뉴에 생긴 폭싹으로 열어요."],
    note: "아이콘이 안 보이면 오른쪽 위 ⋮ → 전송, 저장, 공유 → '페이지를 앱으로 설치'를 눌러요.",
  },
  edge: {
    steps: ["주소창 오른쪽의 앱 설치 아이콘(⊞)을 눌러요.", "'설치'를 눌러요.", "작업 표시줄·시작 메뉴의 폭싹으로 열어요."],
    note: "아이콘이 안 보이면 오른쪽 위 … → 앱 → '이 사이트를 앱으로 설치'를 눌러요.",
  },
  "mac-safari": {
    steps: ["화면 맨 위 메뉴 막대에서 '파일'을 눌러요.", "'Dock에 추가'를 눌러요.", "'추가'를 누르면 Dock에 폭싹이 생겨요."],
    note: "macOS Sonoma(14) 이상에서 돼요. 안 되면 크롬으로 열어 주세요.",
  },
  firefox: {
    steps: ["파이어폭스는 앱 설치를 지원하지 않아요.", "크롬·엣지·사파리로 열면 앱으로 설치할 수 있어요."],
    note: "설치하지 않아도 이 화면에서 알림은 켤 수 있어요(컴퓨터).",
  },
  inapp: {
    steps: ["지금은 카카오톡·네이버 같은 앱 안의 브라우저예요. 여기선 설치·알림이 안 돼요.", "오른쪽 위(또는 아래) 메뉴 ⋮ / 공유를 눌러요.", "'다른 브라우저로 열기'(아이폰은 Safari로 열기)를 눌러요.", "열린 브라우저에서 이 안내를 다시 따라 해요."],
  },
  other: {
    steps: ["브라우저 메뉴에서 '앱 설치' 또는 '홈 화면에 추가'를 찾아 눌러요.", "메뉴에 없으면 크롬(안드로이드·컴퓨터)이나 사파리(아이폰)로 열어 주세요."],
  },
};

/** 알림이 차단됐을 때 다시 켜는 방법 */
export const UNBLOCK: Record<Platform, Guide> = {
  "ios-safari": { steps: ["아이폰 '설정' 앱을 열어요.", "'알림' → '폭싹'을 눌러요.", "'알림 허용'을 켜요."] },
  "ios-other": { steps: ["아이폰 '설정' 앱을 열어요.", "'알림' → '폭싹'을 눌러요.", "'알림 허용'을 켜요."] },
  android: { steps: ["홈 화면의 폭싹 아이콘을 길게 눌러 '앱 정보'를 눌러요.", "'알림'을 켜요.", "앱을 다시 열고 알림 켜기를 눌러요."], note: "설치 전이라면 크롬 ⋮ → 설정 → 사이트 설정 → 알림에서 이 사이트를 허용해요." },
  samsung: { steps: ["홈 화면의 폭싹 아이콘을 길게 눌러 '앱 정보'를 눌러요.", "'알림'을 켜요.", "앱을 다시 열고 알림 켜기를 눌러요."] },
  "desktop-chrome": { steps: ["주소창 왼쪽의 아이콘(⚙ 또는 자물쇠)을 눌러요.", "'알림'을 '허용'으로 바꿔요.", "페이지를 새로고침하고 알림 켜기를 눌러요."], note: "맥은 시스템 설정 → 알림 → Google Chrome 도 켜져 있어야 보여요." },
  edge: { steps: ["주소창 왼쪽의 자물쇠 아이콘을 눌러요.", "'사이트 권한' → '알림'을 '허용'으로 바꿔요.", "새로고침하고 알림 켜기를 눌러요."] },
  "mac-safari": { steps: ["메뉴 막대 'Safari' → '설정'을 눌러요.", "'웹사이트' → '알림'에서 이 사이트를 '허용'으로 바꿔요.", "새로고침하고 알림 켜기를 눌러요."] },
  firefox: { steps: ["주소창 왼쪽의 자물쇠 아이콘을 눌러요.", "'알림 보내기' 차단 옆 ✕를 눌러 풀어요.", "새로고침하고 알림 켜기를 눌러요."] },
  inapp: INSTALL.inapp,
  other: { steps: ["브라우저 설정의 '사이트 설정' → '알림'에서 이 사이트를 허용해요.", "새로고침하고 알림 켜기를 눌러요."] },
};
