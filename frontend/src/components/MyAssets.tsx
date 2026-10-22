"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, type User } from "@/lib/api";
import { Button, Notice } from "./ui";

type Asset = { id: string; analysis_id: string; created_at: string; road_addr: string; jibun_addr: string; pnu: string };

export function MyAssets() {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ user: User | null }>("/api/auth/me").then(async (r) => {
      setUser(r.user);
      if (r.user) setAssets((await api<{ assets: Asset[] }>("/api/assets")).assets);
    }).catch((e) => setError(e.message));
  }, []);

  if (user === undefined) return <div className="mx-auto h-24 max-w-2xl animate-pulse rounded-2xl bg-fill" />;
  if (!user) return <div className="mx-auto max-w-2xl"><Notice>관심자산은 로그인한 뒤 볼 수 있어요. <Link className="font-bold text-brand-strong" href="/login?next=/my">로그인</Link></Notice></div>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-[26px] font-extrabold">관심자산</h1>
        <Button variant="secondary" onClick={async () => { await api("/api/auth/logout", { method: "POST" }); router.push("/"); router.refresh(); }}>로그아웃</Button>
      </div>
      <p className="text-[14px] text-subtle">{user.email} · 조회를 마치면 자동 저장돼요. 같은 건물·필지는 한 번만 저장해요. 저장은 소유권 인증이 아니에요.</p>
      {error && <Notice tone="bad">{error}</Notice>}
      {assets?.length === 0 && <Notice>아직 저장한 빈집이 없어요. <Link className="font-bold text-brand-strong" href="/analyze?mode=live">분석 시작</Link></Notice>}
      <ul className="space-y-2">
        {assets?.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-2xl bg-fill p-1 pr-2">
            <Link href={`/analyses/${a.analysis_id}`} className="min-w-0 flex-1 rounded-xl p-4 hover:bg-fill-strong">
              <span className="block truncate font-bold">{a.road_addr}</span>
              <span className="text-[13px] text-subtle">{a.jibun_addr} · 저장 {new Date(a.created_at).toLocaleDateString("ko-KR")}</span>
            </Link>
            <button aria-label={`${a.road_addr} 삭제`} className="h-10 rounded-lg px-3 text-[13px] font-bold text-bad hover:bg-fill-strong"
              onClick={async () => {
                try { await api(`/api/assets/${a.id}`, { method: "DELETE" }); setAssets((s) => s?.filter((x) => x.id !== a.id) ?? null); }
                catch (e) { setError(`삭제 실패: ${(e as Error).message}`); }
              }}>삭제</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
