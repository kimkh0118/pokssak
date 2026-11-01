"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { DeviceGuide } from "./InstallGuide";
import { currentSubscription, disablePush, enablePush, isIosNotInstalled, pushSupported } from "@/lib/push";

// 이 기기에서 푸시 알림 켜기·끄기
export function NotifyToggle({ compact }: { compact?: boolean }) {
  const [state, setState] = useState<"loading" | "on" | "off" | "unsupported" | "ios" | "denied">("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      if (isIosNotInstalled()) return setState("ios");
      if (!pushSupported()) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      setState((await currentSubscription()) ? "on" : "off");
    })();
  }, []);
  async function toggle() {
    setBusy(true); setNote(null);
    if (state === "on") { await disablePush(); setState("off"); }
    else {
      const r = await enablePush();
      if (r === "on") { setState("on"); await fetch("/api/push/test", { method: "POST" }); }
      else if (r === "denied") setState("denied");
      else if (r === "unsupported") setState("unsupported");
      else setNote("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.");
    }
    setBusy(false);
  }
  if (compact && ["ios", "unsupported", "denied"].includes(state)) {
    const short = { ios: "홈 화면에 추가하면 알림 가능", unsupported: "이 브라우저는 알림 미지원", denied: "알림 차단됨" }[state as "ios"];
    return <Link href="/more" className="shrink-0 rounded-lg bg-fill px-2.5 py-1.5 text-right text-[12px] font-bold text-muted">{short}</Link>;
  }
  if (state === "ios") return <p className="text-[13px] text-muted">아이폰은 <b>홈 화면에 추가</b>한 앱에서만 알림을 받을 수 있어요. 아래 <b>앱으로 설치</b> 안내를 따라 해 주세요.</p>;
  if (state === "unsupported") return <p className="text-[13px] text-muted">이 브라우저는 푸시 알림을 지원하지 않아요. 아래 <b>앱으로 설치</b> 안내대로 크롬·사파리에서 열어 주세요. 알림은 앱의 알림 탭에서도 볼 수 있어요.</p>;
  if (state === "denied") return (
    <div>
      <p className="text-[13px] font-bold text-bad">알림이 차단돼 있어요.</p>
      <details className="mt-1">
        <summary className="cursor-pointer text-[13px] font-bold text-muted">다시 허용하는 방법 보기</summary>
        <div className="mt-2"><DeviceGuide kind="unblock" /></div>
      </details>
    </div>
  );
  return (
    <div>
      <div className={compact ? "" : "flex items-center justify-between gap-3"}>
        {!compact && <span className="text-[15px] font-bold">이 기기로 알림 받기</span>}
        <button type="button" role="switch" aria-checked={state === "on"} disabled={busy || state === "loading"} onClick={() => void toggle()}
          className={`relative h-8 w-14 shrink-0 rounded-full transition-colors ${state === "on" ? "bg-brand" : "bg-fill-strong"} disabled:opacity-60`}>
          <span className={`absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all ${state === "on" ? "left-7" : "left-1"}`} />
          <span className="sr-only">알림 {state === "on" ? "끄기" : "켜기"}</span>
        </button>
      </div>
      {note && <p role="alert" className="mt-2 text-[12px] text-bad">{note}</p>}
    </div>
  );
}
