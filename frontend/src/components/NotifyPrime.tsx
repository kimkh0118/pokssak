"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { currentSubscription, disablePush, enablePush, isIosNotInstalled, pushSupported } from "@/lib/push";
import { toast } from "@/lib/toast";
import { DeviceGuide } from "./InstallGuide";

type State = "loading" | "off" | "on" | "ios" | "denied" | "unsupported";
export const LATER_KEY = "notify-later";

const GAINS = [
  { icon: "📈", title: "내 자산 가격이 크게 바뀌면 바로", body: "예상 가격이 3% 넘게 오르거나 내리면 그날 알려드려요. 팔 때를 놓치지 않아요." },
  { icon: "🏛️", title: "새 공시가격이 나오는 날", body: "매년 봄 개별주택가격이 발표되면 내 자산 금액이 어떻게 바뀌었는지 알려드려요." },
  { icon: "💬", title: "문의에 답장이 오면", body: "운영자가 답하면 바로 알려드려서 기다리지 않아도 돼요." },
];
const LOSSES = [
  { title: "가격이 크게 바뀌어도 모르고 지나가요", body: "직접 앱을 열어 하나씩 확인해야 해요. 좋은 매도 시점을 놓칠 수 있어요." },
  { title: "공시가격 발표를 놓쳐요", body: "세금·매매가 기준이 바뀌는 날을 따로 챙겨야 해요." },
  { title: "문의 답장을 늦게 봐요", body: "답장이 와도 알림함에 들어가기 전까지는 알 수 없어요." },
];

function Bell() {
  return (
    <div className="relative mx-auto grid h-28 w-28 place-items-center rounded-[32px] bg-surface shadow-[0_12px_30px_-12px_rgba(60,40,30,.3)] ring-1 ring-line">
      <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#c9483b" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="onb-ring">
        <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      <span className="absolute -right-2 -top-2 grid h-7 min-w-7 place-items-center rounded-full bg-bad px-1.5 text-[13px] font-extrabold text-white shadow">3</span>
    </div>
  );
}

// 알림 전용 화면: 켜면 받는 혜택 → '다음에 할래요'를 누르면 놓치는 것 → 그래도 나중이면 넘어감
export function NotifyPrime() {
  const router = useRouter();
  const raw = useSearchParams().get("next") ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  const [state, setState] = useState<State>("loading");
  const [view, setView] = useState<"gain" | "loss" | "done">("gain");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      if (isIosNotInstalled()) return setState("ios");
      if (!pushSupported()) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      setState((await currentSubscription()) ? "on" : "off");
    })();
  }, []);

  const leave = () => router.replace(next || "/my");

  async function turnOn() {
    setBusy(true);
    const r = await enablePush();
    setBusy(false);
    if (r === "on") {
      setState("on"); setView("done");
      try { localStorage.removeItem(LATER_KEY); } catch {}
      await fetch("/api/push/test", { method: "POST" }).catch(() => {});
    } else if (r === "denied") setState("denied");
    else if (r === "unsupported") setState("unsupported");
    else toast("알림을 켜지 못했어요. 잠시 후 다시 시도해 주세요.", { tone: "bad" });
  }

  function later() {
    try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch {}
    toast("더보기 → 알림 설정에서 언제든 켤 수 있어요");
    leave();
  }

  const primary = "press h-14 w-full rounded-2xl bg-brand text-[17px] font-bold text-white shadow-[0_8px_20px_-8px_rgba(169,93,46,.8)] disabled:opacity-50";
  const secondary = "press h-12 w-full rounded-2xl text-[15px] font-bold text-subtle";

  if (state === "loading") return <div className="mx-auto mt-10 h-60 max-w-md animate-pulse rounded-3xl bg-fill" />;

  // 이미 켜져 있음(설정 화면 역할)
  if (state === "on" && view !== "done") {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-4 text-center">
        <Bell />
        <div>
          <h1 className="text-[24px] font-extrabold">알림이 켜져 있어요</h1>
          <p className="mt-2 text-[15px] text-muted">이 기기로 가격 변동·공시가격·문의 답장을 알려드려요.</p>
        </div>
        <ul className="stagger space-y-2 text-left">{GAINS.map((g) => <Gain key={g.title} {...g} on />)}</ul>
        <button type="button" className={secondary} onClick={async () => { await disablePush(); setState("off"); toast("이 기기 알림을 껐어요"); }}>이 기기 알림 끄기</button>
      </div>
    );
  }

  if (view === "done") {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-10 text-center">
        <div className="onb-pop mx-auto grid h-24 w-24 place-items-center rounded-full bg-[#e7f6ee] text-[44px]">✓</div>
        <div>
          <h1 className="text-[24px] font-extrabold">알림을 켰어요</h1>
          <p className="mt-2 text-[15px] text-muted">확인용 시험 알림을 보냈어요. 이제 중요한 변화가 생기면 먼저 알려드릴게요.</p>
        </div>
        <button type="button" className={primary} onClick={leave}>계속하기</button>
      </div>
    );
  }

  if (view === "loss") {
    return (
      <div className="mx-auto max-w-md space-y-6 pt-4">
        <div className="text-center">
          <p className="text-[40px]" aria-hidden>🔕</p>
          <h1 className="mt-2 text-[24px] font-extrabold leading-tight">알림 없이 쓰면<br />이런 걸 놓쳐요</h1>
        </div>
        <ul className="stagger space-y-2">
          {LOSSES.map((l) => (
            <li key={l.title} className="flex gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
              <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-bad-soft text-[13px] font-extrabold text-bad">✕</span>
              <span><b className="block text-[15px]">{l.title}</b><span className="mt-0.5 block text-[13px] text-muted">{l.body}</span></span>
            </li>
          ))}
        </ul>
        <div className="space-y-1">
          {state === "off" && <button type="button" disabled={busy} className={primary} onClick={() => void turnOn()}>{busy ? "켜는 중…" : "알림 켜고 놓치지 않기"}</button>}
          {state !== "off" && <button type="button" className={primary} onClick={() => setView("gain")}>켜는 방법 다시 보기</button>}
          <button type="button" className={secondary} onClick={later}>그래도 다음에 할게요</button>
        </div>
      </div>
    );
  }

  // 처음: 혜택
  return (
    <div className="mx-auto max-w-md space-y-6 pt-4">
      <Bell />
      <div className="text-center">
        <h1 className="text-[24px] font-extrabold leading-tight">알림을 켜면<br />이런 걸 먼저 알려드려요</h1>
        <p className="mt-2 text-[14px] text-subtle">꼭 필요할 때만 보내요. 광고 알림은 보내지 않아요.</p>
      </div>
      <ul className="stagger space-y-2">{GAINS.map((g) => <Gain key={g.title} {...g} />)}</ul>

      {state === "ios" && (
        <div className="rounded-2xl bg-warn-soft p-4">
          <p className="text-[14px] font-bold text-warn">아이폰은 홈 화면에 추가한 앱에서만 알림을 받을 수 있어요</p>
          <div className="mt-2"><DeviceGuide kind="install" /></div>
        </div>
      )}
      {state === "denied" && (
        <div className="rounded-2xl bg-bad-soft p-4">
          <p className="text-[14px] font-bold text-bad">이 기기에서 알림이 차단돼 있어요. 아래 순서로 허용한 뒤 다시 눌러 주세요.</p>
          <div className="mt-2"><DeviceGuide kind="unblock" /></div>
        </div>
      )}
      {state === "unsupported" && (
        <p className="rounded-2xl bg-fill p-4 text-[14px] text-muted">이 브라우저는 알림을 지원하지 않아요. 크롬(안드로이드·컴퓨터)이나 사파리(아이폰, 홈 화면에 추가)에서 열어 주세요. 알림 탭에서는 계속 볼 수 있어요.</p>
      )}

      <div className="space-y-1">
        {state === "off" && <button type="button" disabled={busy} className={primary} onClick={() => void turnOn()}>{busy ? "켜는 중…" : "알림 켜기"}</button>}
        {state === "denied" && <button type="button" className={primary} onClick={() => window.location.reload()}>허용했어요, 다시 확인</button>}
        <button type="button" className={secondary} onClick={() => setView("loss")}>다음에 할래요</button>
      </div>
      {next && <p className="text-center"><Link href={next} className="sr-only">건너뛰기</Link></p>}
    </div>
  );
}

function Gain({ icon, title, body, on }: { icon: string; title: string; body: string; on?: boolean }) {
  return (
    <li className="flex gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-[20px]">{icon}</span>
      <span className="min-w-0"><b className="block text-[15px]">{title}{on && <span className="ml-1.5 text-[12px] font-bold text-good">받는 중</span>}</b><span className="mt-0.5 block text-[13px] text-muted">{body}</span></span>
    </li>
  );
}

/** 다른 화면에 넣는 작은 안내: 알림이 꺼져 있을 때만 보이고 누르면 알림 화면으로 */
export function NotifyBanner({ from }: { from: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    (async () => {
      if (isIosNotInstalled() || !pushSupported()) return setShow(true);
      if (Notification.permission === "denied") return setShow(true);
      setShow(!(await currentSubscription()));
    })();
  }, []);
  if (!show) return null;
  return (
    <Link href={`/notify?next=${encodeURIComponent(from)}`} className="press flex items-center gap-3 rounded-2xl bg-sign p-4 text-white shadow-sm">
      <span aria-hidden className="text-[22px]">🔔</span>
      <span className="min-w-0 flex-1"><b className="block text-[15px]">알림이 꺼져 있어요</b><span className="block text-[13px] text-white/75">켜면 가격이 크게 바뀔 때 먼저 알려드려요</span></span>
      <span aria-hidden className="text-[20px] text-white/80">›</span>
    </Link>
  );
}
