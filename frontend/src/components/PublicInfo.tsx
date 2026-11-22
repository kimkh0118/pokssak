"use client";

import type { Check, Fetched, Lookup } from "@/lib/api";
import { Pill, ProviderErrorBox } from "./ui";

type Info = Pick<Lookup, "address" | "pnu" | "buildings" | "land" | "landUse" | "mainBuildings" | "checks"> & {
  houseTrades?: Fetched<unknown[]> | { ok: boolean; failedMonths?: string[] };
  landTrades?: Fetched<unknown[]> | { ok: boolean; failedMonths?: string[] };
  mode: string;
};

const ISSUE_TITLE: Record<string, { fail?: string; unknown?: string }> = {
  busan: { fail: "부산 주소가 아니에요" },
  type: { fail: "단독·다가구주택이 아니에요", unknown: "주택 종류를 확인하지 못했어요" },
  scope: { fail: "분석할 건물 범위가 맞지 않아요", unknown: "분석할 건물 범위를 확인해야 해요" },
  consistency: { fail: "건물 서류와 땅 서류의 면적이 조금 달라요", unknown: "건물·땅 면적을 비교하지 못했어요" },
};

/** 조건 확인: 충족한 항목은 보여주지 않고, 못 맞추거나 확인이 필요한 항목만 이유와 함께 */
export function Checks({ checks }: { checks: Check[] }) {
  const issues = checks.filter((c) => c.status !== "pass");
  if (!issues.length) return null;
  return (
    <ul className="space-y-2">
      {issues.map((c) => (
        <li key={c.key} className={`rounded-xl p-3 ${c.status === "fail" && c.key !== "consistency" ? "bg-bad-soft" : "bg-warn-soft"}`}>
          <p className={`text-[14px] font-bold ${c.status === "fail" && c.key !== "consistency" ? "text-bad" : "text-warn"}`}>
            {ISSUE_TITLE[c.key]?.[c.status as "fail" | "unknown"] ?? `${c.label}: ${c.status === "fail" ? "해당하지 않아요" : "확인이 필요해요"}`}
          </p>
          {c.detail && <p className="mt-1 text-[13px] text-muted">{c.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 text-[15px]">
      <span className="shrink-0 text-subtle">{k}</span>
      <span className="text-right font-semibold">{v ?? <span className="text-subtle">확인 안 됨</span>}</span>
    </div>
  );
}

/** 19980108 → "1998년 1월 · 28년 됨" */
function approval(d?: string | null) {
  if (!d || d.length < 6) return null;
  const y = Number(d.slice(0, 4)), m = Number(d.slice(4, 6));
  if (!y) return null;
  const age = new Date().getFullYear() - y;
  return `${y}년${m ? ` ${m}월` : ""} · ${age}년 됨`;
}

/** 도로접면 코드 → 쉬운 말 */
function roadText(v?: string | null) {
  if (!v) return null;
  const width = v.startsWith("광대") ? "아주 넓은 길(25m 이상)" : v.startsWith("중로") ? "넓은 길(12~25m)" : v.startsWith("소로") ? "보통 길(8~12m)"
    : v.startsWith("세로") ? (v.includes("불") ? "차가 못 다니는 좁은 길" : "차가 다니는 좁은 길") : v.includes("맹지") ? "도로에 닿지 않음(맹지)" : null;
  return width ? `${width}${v.includes("각지") ? " · 모퉁이 땅" : ""}` : v;
}

const pyeong = (m2?: number | null) => (m2 != null ? `${m2.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}㎡ (${(m2 / 3.3058).toFixed(0)}평)` : null);

export function PublicInfo({ lookup, compact }: { lookup: Info; compact?: boolean }) {
  const b = lookup.buildings;
  const land = lookup.land;
  const main = lookup.mainBuildings[0];
  // 토지이용계획: 같은 이름은 한 번만
  const uses = lookup.landUse.ok ? [...new Set(lookup.landUse.data.map((u) => u.name))] : [];
  return (
    <section className="space-y-4" aria-label="이 집 기본 정보">
      {!compact && (
        <div>
          <p className="text-[13px] font-bold text-brand-strong">이 집이 맞나요?</p>
          <h1 className="mt-1 text-[20px] font-extrabold leading-snug tracking-tight">{lookup.address.roadAddr}</h1>
          <p className="mt-0.5 text-[13px] text-subtle">{lookup.address.jibunAddr}</p>
        </div>
      )}
      <Checks checks={lookup.checks} />
      {b.ok ? (
        <div className="divide-y divide-line">
          <Row k="건물 종류" v={[...new Set(b.data.map((x) => x.mainPurpsCdNm))].join(", ")} />
          <Row k="지은 해" v={approval(main?.useAprDay)} />
          <Row k="구조·층수" v={[main?.strctCdNm, main?.grndFlrCnt != null ? `${main.grndFlrCnt}층` : null].filter(Boolean).join(" · ") || null} />
          <Row k="건물 넓이" v={pyeong(main?.totArea)} />
          {land.ok && <Row k="땅 넓이" v={pyeong(land.data.lndpclAr)} />}
          {land.ok && <Row k="앞 도로" v={roadText(land.data.roadSideCodeNm)} />}
        </div>
      ) : <ProviderErrorBox error={b.error} title="건축물대장" />}
      {!land.ok && <ProviderErrorBox error={land.error} title="토지 정보" />}
      <details className="group rounded-xl bg-fill px-4 py-3 text-[14px]">
        <summary className="flex cursor-pointer list-none items-center justify-between font-bold text-muted">
          자세한 공공자료 <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="mt-2 divide-y divide-line">
          {land.ok && <Row k="도로접면(원래 표기)" v={land.data.roadSideCodeNm} />}
          {land.ok && <Row k="지목" v={land.data.lndcgrCodeNm} />}
          {land.ok && <Row k="용도지역" v={land.data.prposArea1Nm} />}
          {land.ok && <Row k="지형" v={[land.data.tpgrphHgCodeNm, land.data.tpgrphFrmCodeNm].filter(Boolean).join(" · ") || null} />}
          {land.ok && <Row k={`공시지가(${land.data.stdrYear ?? "?"})`} v={land.data.pblntfPclnd ? `㎡당 ${land.data.pblntfPclnd.toLocaleString("ko-KR")}원` : null} />}
          {main?.platArea != null && <Row k="대지면적(건축물대장)" v={`${main.platArea}㎡`} />}
        </div>
        {uses.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">{uses.map((u) => <Pill key={u}>{u}</Pill>)}</div>
        )}
        {!lookup.landUse.ok && <div className="mt-2"><ProviderErrorBox error={lookup.landUse.error} title="토지이용계획" /></div>}
        <TradeStatus label="주변 주택 거래" t={lookup.houseTrades} />
        <TradeStatus label="주변 토지 거래" t={lookup.landTrades} />
        <p className="mt-2 text-[12px] text-subtle">모두 정부 공공자료(건축물대장·토지특성·실거래가)예요. 공시지가는 참고용이며 판매가격이 아니에요.</p>
      </details>
    </section>
  );
}

function TradeStatus({ label, t }: { label: string; t?: Info["houseTrades"] }) {
  if (!t) return null;
  if (!t.ok) return "error" in t ? <div className="mt-2"><ProviderErrorBox error={t.error} title={label} /></div> : null;
  const failed = t.failedMonths ?? [];
  return (
    <p className="mt-2 text-[12px] text-subtle">
      {label}: {"data" in t ? `같은 구 최근 2년 ${t.data.length}건` : "조회됨"}
      {failed.length > 0 && <span className="text-warn"> · 못 받은 달 {failed.join(", ")}</span>}
    </p>
  );
}
