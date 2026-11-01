"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type User } from "@/lib/api";
import { Notice } from "./ui";
import { NotifyToggle } from "./NotifyToggle";

type Item = { id: string; event?: string; title: string; body: string; created_at: string; read_at: string | null };

// 관심 집의 예상 가격 변동 알림과 문의 답장 알림. 열면 모두 읽음으로 바꾼다.
export function Inbox() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me").then(async (r) => {
      setUser(r.user);
      if (!r.user) return;
      setItems((await api<{ items: Item[] }>("/api/notifications")).items);
      await api("/api/notifications/read", { method: "POST" });
      window.dispatchEvent(new Event("notifications-read"));
    }).catch((e) => setError(e.message));
  }, []);

  if (user === undefined) return <div className="mx-auto h-24 max-w-md animate-pulse rounded-2xl bg-fill" />;
  if (!user) return (
    <div className="mx-auto max-w-md rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-line">
      <p className="text-[17px] font-extrabold">알림은 로그인한 뒤 볼 수 있어요</p>
      <Link className="mt-4 inline-flex h-11 items-center rounded-xl bg-brand px-6 font-bold text-white" href="/login?next=/notifications">로그인</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-[24px] font-extrabold">알림</h1>
      <div className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line"><NotifyToggle /></div>
      {error && <Notice tone="bad">{error}</Notice>}
      {items?.length === 0 && (
        <div className="rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-line">
          <p className="font-bold">아직 알림이 없어요</p>
          <p className="mt-1 text-[13px] text-subtle">관심 집의 예상 가격이 3% 넘게 바뀌거나 새 공시가격이 나오면 여기와 휴대폰으로 알려드려요.</p>
        </div>
      )}
      <ul className="space-y-2">
        {items?.map((n) => (
          <li key={n.id} className="rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
            <p className="flex items-center justify-between gap-2">
              <b className="text-[15px]">{n.title}{!n.read_at && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[11px] text-white">새 알림</span>}</b>
              <span className="shrink-0 text-[12px] text-subtle">{new Date(n.created_at).toLocaleDateString("ko-KR")}</span>
            </p>
            <p className="mt-1 text-[14px] text-muted">{n.body}</p>
            {n.event === "inquiry_reply" && <Link href="/inquiry" className="mt-2 inline-block text-[13px] font-bold text-brand-strong">답장 보기 ›</Link>}
          </li>
        ))}
      </ul>
    </div>
  );
}
