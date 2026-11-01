"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { api, type User } from "@/lib/api";
import { isStandalone } from "@/lib/device";
import { SITE } from "@/lib/site";
import { DeviceGuide } from "./InstallGuide";
import { NotifyToggle } from "./NotifyToggle";

function Row({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="flex h-12 items-center justify-between px-4 text-[15px] font-semibold">
      {label}<span aria-hidden className="text-subtle">›</span>
    </Link>
  );
}

const noopSub = () => () => {};

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

// 더보기: 계정 · 알림 · 앱 설치 · 안내
export function More() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const standalone = useSyncExternalStore(noopSub, isStandalone, () => false);
  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null));
    const on = (e: Event) => { e.preventDefault(); setInstall(e as InstallEvent); };
    window.addEventListener("beforeinstallprompt", on);
    return () => window.removeEventListener("beforeinstallprompt", on);
  }, []);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <h1 className="text-[24px] font-extrabold">더보기</h1>

      <section className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
        {user === undefined ? <div className="h-12 animate-pulse rounded-xl bg-fill" /> : user ? (
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-sign text-[17px] font-extrabold text-white">{user.email[0]?.toUpperCase()}</span>
            <span className="min-w-0 flex-1"><b className="block truncate">{user.email}</b><span className="text-[13px] text-subtle">로그인됨</span></span>
            <button className="rounded-lg bg-fill px-3 py-2 text-[13px] font-bold"
              onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.replace("/welcome"); }}>로그아웃</button>
          </div>
        ) : (
          <div>
            <p className="font-bold">로그인하면 관심 집을 저장하고 가격이 바뀔 때 알림을 받을 수 있어요.</p>
            <Link href="/login?next=/more" className="mt-3 flex h-12 items-center justify-center rounded-xl bg-brand text-[15px] font-bold text-white">로그인</Link>
          </div>
        )}
      </section>

      {user && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
          <h2 className="text-[16px] font-extrabold">알림</h2>
          <p className="mt-0.5 text-[13px] text-subtle">관심 집의 예상 가격이 3% 넘게 바뀌거나 새 공시가격이 나오면 휴대폰으로 알려드려요.</p>
          <div className="mt-3"><NotifyToggle /></div>
        </section>
      )}

      {!standalone && (
        <section className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
          <h2 className="text-[16px] font-extrabold">앱으로 설치</h2>
          <p className="mt-0.5 text-[13px] text-subtle">{SITE.name}을 앱처럼 설치하면 바로 열 수 있고, 휴대폰으로 가격 알림을 받을 수 있어요.</p>
          {install && (
            <button className="mt-3 h-11 w-full rounded-xl bg-ink text-[15px] font-bold text-white" onClick={async () => { await install.prompt(); setInstall(null); }}>지금 설치하기</button>
          )}
          <div className="mt-3"><DeviceGuide kind="install" /></div>
        </section>
      )}

      <section className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-sm ring-1 ring-line">
        <Row href="/about" label="계산 방법" />
        <Row href="/faq" label="자주 묻는 질문" />
        <Row href="/terms" label="이용약관" />
        <Row href="/privacy" label="개인정보처리방침" />
      </section>

      {user && (
        <button type="button" className="px-1 text-[13px] font-bold text-subtle underline underline-offset-2"
          onClick={async () => {
            if (!window.confirm("탈퇴하면 관심 집·분석 기록·알림·동의 기록이 모두 바로 지워지고 되돌릴 수 없어요. 탈퇴할까요?")) return;
            await api("/api/auth/delete", { method: "POST" });
            router.replace("/welcome");
          }}>회원 탈퇴</button>
      )}

      <p className="px-1 text-[12px] leading-relaxed text-subtle">
        자료: 행정안전부 도로명주소, 국토교통부 건축물대장·실거래가(공공데이터포털), 브이월드 토지특성·개별주택가격·부동산중개업 정보.
        계산 결과는 공개 자료와 가정에 기반한 예상값이며 세금·법률·감정평가를 대신하지 않아요.
      </p>
    </div>
  );
}
