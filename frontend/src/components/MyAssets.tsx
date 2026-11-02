"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "@/lib/toast";
import { api, type User } from "@/lib/api";
import { formatWon } from "@/lib/format";
import { Notice } from "./ui";
import { NotifyBanner } from "./NotifyPrime";

type Snap = { house_value: number | null; land_value: number | null; checked_at: string };
type Asset = { id: string; analysis_id: string; created_at: string; road_addr: string; jibun_addr: string; pnu: string; price: Snap | null; previous: Snap | null };

function change(cur?: number | null, prev?: number | null) {
  if (!cur || !prev) return null;
  const p = (cur / prev - 1) * 100;
  return Math.abs(p) < 0.05 ? "변동 없음" : `${p > 0 ? "▲" : "▼"} ${Math.abs(p).toFixed(1)}% (지난 확인 대비)`;
}

export function MyAssets() {
    const [user, setUser] = useState<User | null | undefined>(undefined);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me").then(async (r) => {
      setUser(r.user);
      if (r.user) setAssets((await api<{ assets: Asset[] }>("/api/assets")).assets);
    }).catch((e) => setError(e.message));
  }, []);

  if (user === undefined) return <div className="mx-auto h-24 max-w-md animate-pulse rounded-2xl bg-fill" />;
  if (!user) return (
    <div className="mx-auto max-w-md rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-line">
      <p className="text-[17px] font-extrabold">내 자산은 로그인한 뒤 볼 수 있어요</p>
      <p className="mt-1 text-[13px] text-subtle">저장한 집의 예상 가격이 바뀌면 알림으로 알려드려요.</p>
      <Link className="mt-4 inline-flex h-11 items-center rounded-xl bg-brand px-6 font-bold text-white" href="/login?next=/my">로그인</Link>
    </div>
  );

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-[24px] font-extrabold">내 자산</h1>
      <NotifyBanner from="/my" />
      {error && <Notice tone="bad">{error}</Notice>}
      {assets?.length === 0 && (
        <div className="rounded-2xl bg-surface p-6 text-center shadow-sm ring-1 ring-line">
          <p className="font-bold">아직 저장한 집이 없어요</p>
          <p className="mt-1 text-[13px] text-subtle">집을 조회하면 자동으로 여기에 저장돼요.</p>
          <Link className="mt-4 inline-flex h-11 items-center rounded-xl bg-brand px-5 font-bold text-white" href="/analyze">집 조회하기</Link>
        </div>
      )}
      <ul className="stagger space-y-2">
        {assets?.map((a) => {
          const ch = change(a.price?.house_value, a.previous?.house_value);
          return (
            <li key={a.id} className="flex items-center gap-1 rounded-2xl bg-surface shadow-sm ring-1 ring-line">
              <Link href={`/analyses/${a.analysis_id}`} className="min-w-0 flex-1 p-4 active:opacity-70">
                <span className="block truncate text-[15px] font-bold">{a.road_addr}</span>
                <span className="block truncate text-[12px] text-subtle">{a.jibun_addr}</span>
                {a.price?.house_value ? (
                  <span className="mt-2 flex items-baseline gap-2">
                    <b className="tabular text-[17px]">{formatWon(a.price.house_value)}</b>
                    {ch && <span className={`text-[12px] font-bold ${ch.startsWith("▲") ? "text-bad" : ch.startsWith("▼") ? "text-sign" : "text-subtle"}`}>{ch}</span>}
                  </span>
                ) : <span className="mt-2 block text-[12px] text-subtle">예상 가격 계산 전</span>}
                {a.price && <span className="block text-[11px] text-subtle">확인 {new Date(a.price.checked_at).toLocaleDateString("ko-KR")}</span>}
              </Link>
              <button aria-label={`${a.road_addr} 내 자산에서 삭제`} className="mr-2 h-10 rounded-lg px-3 text-[13px] font-bold text-subtle hover:text-bad"
                onClick={async () => {
                  const before = assets;
                  setAssets((s) => s?.filter((x) => x.id !== a.id) ?? null);  // 먼저 화면에서 빼고(바로 반응)
                  try {
                    await api(`/api/assets/${a.id}`, { method: "DELETE" });
                    toast("내 자산에서 뺐어요", { action: { label: "되돌리기", run: async () => {
                      await api(`/api/analyses/${a.analysis_id}/save`, { method: "POST" });
                      setAssets(before);
                      toast("다시 저장했어요");
                    } } });
                  } catch (e) {
                    setAssets(before);
                    toast(`빼지 못했어요: ${(e as Error).message}`, { tone: "bad" });
                  }
                }}>삭제</button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
