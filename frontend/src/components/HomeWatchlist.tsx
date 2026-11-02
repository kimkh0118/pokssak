"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatWon } from "@/lib/format";

type Snap = { house_value: number | null; checked_at: string } | null;
type Asset = { id: string; analysis_id: string; road_addr: string; jibun_addr: string; price: Snap; previous: Snap };

// 홈: 로그인했으면 내 자산 최대 3곳을 바로 보여준다
export function HomeWatchlist() {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  useEffect(() => {
    fetch("/api/assets", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).then((d) => setAssets(d?.assets ?? null)).catch(() => {});
  }, []);
  if (!assets?.length) return null;
  return (
    <section aria-labelledby="watch">
      <div className="flex items-baseline justify-between">
        <h2 id="watch" className="text-[17px] font-extrabold">내 자산</h2>
        <Link href="/my" className="text-[13px] font-bold text-subtle">전체 보기 ›</Link>
      </div>
      <ul className="mt-3 space-y-2">
        {assets.slice(0, 3).map((a) => {
          const cur = a.price?.house_value, prev = a.previous?.house_value;
          const pct = cur && prev ? (cur / prev - 1) * 100 : null;
          return (
            <li key={a.id}>
              <Link href={`/analyses/${a.analysis_id}`} className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line active:scale-[0.99]">
                <span className="min-w-0"><b className="block truncate text-[15px]">{a.road_addr}</b>
                  <span className="text-[12px] text-subtle">{a.jibun_addr}</span></span>
                {cur && (
                  <span className="shrink-0 text-right">
                    <b className="tabular block text-[15px]">{formatWon(cur)}</b>
                    {pct != null && Math.abs(pct) >= 0.05 && <span className={`text-[12px] font-bold ${pct > 0 ? "text-bad" : "text-sign"}`}>{pct > 0 ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}%</span>}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
