"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, type User } from "@/lib/api";
import { Button, Card, Notice } from "./ui";

type Item = { id: string; title: string; body: string; created_at: string; read_at: string | null; event: string };
type Settings = { settings: Record<"in_app" | "email" | "sms" | "push", boolean>; available: Record<"email" | "sms" | "push", boolean> };
const CH = { in_app: "앱 내 알림함", email: "이메일", sms: "문자", push: "푸시" } as const;

export function Inbox() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [items, setItems] = useState<Item[] | null>(null);
  const [s, setS] = useState<Settings | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "bad"; text: string } | null>(null);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me").then(async (r) => {
      setUser(r.user);
      if (!r.user) return;
      setItems((await api<{ items: Item[] }>("/api/notifications")).items);
      setS(await api<Settings>("/api/notifications/settings"));
    }).catch((e) => setMsg({ tone: "bad", text: e.message }));
  }, []);

  if (user === undefined) return <div className="mx-auto h-24 max-w-2xl animate-pulse rounded-2xl bg-fill" />;
  if (!user) return <div className="mx-auto max-w-2xl"><Notice>알림은 로그인한 뒤 볼 수 있어요. <Link className="font-bold text-brand-strong" href="/login?next=/notifications">로그인</Link></Notice></div>;

  async function saveSettings(next: Settings["settings"]) {
    try {
      await api("/api/notifications/settings", { method: "PUT", body: next });
      setS((cur) => (cur ? { ...cur, settings: next } : cur));
      setMsg({ tone: "info", text: "알림 설정을 저장했어요." });
    } catch (e) {
      setMsg({ tone: "bad", text: `알림 설정 저장 실패: ${(e as Error).message}` });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-[26px] font-extrabold">알림함</h1>
      <p className="text-[14px] text-subtle">관심자산과 지원사업 조건을 주 1회 비교해 새 후보·접수 시작·조건 변경·마감을 알려드려요. 지원 확정 알림이 아니에요.</p>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {items?.length === 0 && <Notice>아직 알림이 없어요.</Notice>}
      <ul className="space-y-2">
        {items?.map((n) => (
          <li key={n.id}>
            <Card className={n.read_at ? "opacity-70" : ""}>
              <p className="font-extrabold">{n.title}</p>
              <p className="mt-1 text-[14px] text-muted">{n.body}</p>
              <div className="mt-2 flex items-center justify-between text-[12px] text-subtle">
                <span>{new Date(n.created_at).toLocaleString("ko-KR")}</span>
                {!n.read_at && <button className="font-bold text-brand-strong" onClick={async () => { await api(`/api/notifications/${n.id}/read`, { method: "POST" }); setItems((it) => it?.map((x) => (x.id === n.id ? { ...x, read_at: "now" } : x)) ?? null); }}>읽음</button>}
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {s && (
        <Card>
          <h2 className="font-extrabold">알림 설정</h2>
          <p className="mt-1 text-[13px] text-subtle">관심자산 저장과 외부 알림 수신은 따로 정해요. 이메일·문자·푸시는 발송 공급자가 설정된 경우에만 신청할 수 있어요.</p>
          <div className="mt-3 space-y-2">
            {(Object.keys(CH) as (keyof typeof CH)[]).map((k) => {
              const disabled = k !== "in_app" && !s.available[k];
              return (
                <label key={k} className={`flex items-center justify-between rounded-xl bg-fill px-4 py-3 text-[15px] ${disabled ? "opacity-50" : ""}`}>
                  <span>{CH[k]}{disabled && <span className="ml-2 text-[12px] text-subtle">(공급자 미설정)</span>}</span>
                  <input type="checkbox" className="h-5 w-5" disabled={disabled} checked={s.settings[k]} onChange={(e) => saveSettings({ ...s.settings, [k]: e.target.checked })} />
                </label>
              );
            })}
          </div>
          <Button variant="secondary" className="mt-3" onClick={() => saveSettings({ in_app: false, email: false, sms: false, push: false })}>모든 알림 수신 해제</Button>
        </Card>
      )}
    </div>
  );
}
