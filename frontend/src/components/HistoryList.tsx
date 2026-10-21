"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { readHistory, removeHistory, type HistoryItem } from "@/lib/history";
import type { Verdict } from "@/lib/api";
import { VERDICT_LABEL } from "@/lib/labels";
import { formatWon } from "@/lib/format";
import { Pill } from "./ui";

type Summary = { id: string; found: false } | { id: string; found: true; mode: "live" | "sample"; address: string; updatedAt: string; verdict: Verdict; optionLabel: string | null; comparisonValue: number | null };

export function HistoryList() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [summaries, setSummaries] = useState<Record<string, Summary>>({});

  useEffect(() => {
    const list = readHistory();
    // 브라우저 저장소는 마운트 후에만 읽을 수 있다
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems(list);
    if (list.length === 0) return;
    fetch(`/api/analyses/summary?ids=${list.map((x) => x.id).join(",")}`)
      .then((r) => r.json())
      .then((b: { items: Summary[] }) => setSummaries(Object.fromEntries(b.items.map((s) => [s.id, s]))))
      .catch(() => {});
  }, []);

  if (items === null) return <div className="h-24 animate-pulse rounded-2xl bg-fill" />;
  if (items.length === 0)
    return (
      <div className="rounded-2xl bg-fill p-8 text-center">
        <p className="text-[17px] font-bold">아직 분석한 집이 없어요</p>
        <p className="mt-1 text-[14px] text-subtle">주소 하나로 바로 시작할 수 있어요.</p>
        <div className="mt-5 flex justify-center gap-2">
          <Link href="/analyze?mode=live" className="rounded-xl bg-brand px-5 py-3 text-[15px] font-bold text-white">분석 시작</Link>
          <Link href="/analyze?mode=sample" className="rounded-xl bg-surface px-5 py-3 text-[15px] font-bold text-ink ring-1 ring-line">예시로 체험</Link>
        </div>
      </div>
    );

  return (
    <ul className="space-y-2">
      {items.map((it) => {
        const s = summaries[it.id];
        const gone = s && !s.found;
        return (
          <li key={it.id} className="flex items-center gap-2 rounded-2xl bg-fill p-1 pr-2">
            <Link href={gone ? "#" : `/analyses/${it.id}`} aria-disabled={gone} className={`min-w-0 flex-1 rounded-xl p-4 ${gone ? "pointer-events-none opacity-50" : "hover:bg-fill-strong"}`}>
              <span className="flex flex-wrap items-center gap-1.5">
                {it.mode === "sample" && <Pill tone="gray">예시</Pill>}
                {s?.found && <Pill tone={s.verdict === "recommend" ? "blue" : s.verdict === "needs_quotes" ? "orange" : "gray"}>{VERDICT_LABEL[s.verdict]}</Pill>}
                {gone && <Pill tone="red">결과를 찾을 수 없음</Pill>}
              </span>
              <span className="mt-2 block truncate text-[16px] font-bold">{it.address}</span>
              <span className="mt-0.5 block text-[13px] text-subtle">
                {s?.found && s.optionLabel ? `${s.optionLabel}${s.comparisonValue !== null ? ` · ${formatWon(s.comparisonValue)}` : ""} · ` : ""}
                {new Date(s?.found ? s.updatedAt : it.savedAt).toLocaleDateString("ko-KR")}
              </span>
            </Link>
            <button
              type="button"
              aria-label={`${it.address} 목록에서 지우기`}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-subtle hover:bg-fill-strong hover:text-ink"
              onClick={() => {
                removeHistory(it.id);
                setItems(readHistory());
              }}
            >
              ✕
            </button>
          </li>
        );
      })}
    </ul>
  );
}
