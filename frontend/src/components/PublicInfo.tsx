"use client";

import type { Check, Fetched, Lookup } from "@/lib/api";
import { Pill, ProvenanceBadge, ProviderErrorBox } from "./ui";

type Info = Pick<Lookup, "address" | "pnu" | "buildings" | "land" | "landUse" | "mainBuildings" | "checks"> & {
  houseTrades?: Fetched<unknown[]> | { ok: boolean; failedMonths?: string[] };
  landTrades?: Fetched<unknown[]> | { ok: boolean; failedMonths?: string[] };
  mode: string;
};

const ISSUE_TITLE: Record<string, { fail?: string; unknown?: string }> = {
  busan: { fail: "부산 주소가 아니에요" },
  type: { fail: "단독·다가구주택이 아니에요", unknown: "주택 종류를 확인하지 못했어요" },
  scope: { fail: "분석할 건물 범위가 맞지 않아요", unknown: "분석할 건물 범위를 확인해야 해요" },
  consistency: { fail: "건축물대장과 토지 정보가 맞지 않아요", unknown: "건축물대장과 토지 정보를 비교하지 못했어요" },
};

/** 조건 확인: 충족한 항목은 보여주지 않고, 못 맞추거나 확인이 필요한 항목만 이유와 함께 */
export function Checks({ checks }: { checks: Check[] }) {
  const issues = checks.filter((c) => c.status !== "pass");
  if (!issues.length) return null;
  return (
    <ul className="space-y-2">
      {issues.map((c) => (
        <li key={c.key} className={`rounded-xl p-3 ${c.status === "fail" ? "bg-bad-soft" : "bg-warn-soft"}`}>
          <p className={`text-[14px] font-bold ${c.status === "fail" ? "text-bad" : "text-warn"}`}>
            {ISSUE_TITLE[c.key]?.[c.status as "fail" | "unknown"] ?? `${c.label}: ${c.status === "fail" ? "해당하지 않아요" : "확인이 필요해요"}`}
          </p>
          {c.detail && <p className="mt-1 text-[13px] text-muted">{c.detail}</p>}
        </li>
      ))}
    </ul>
  );
}

function Row({ k, v, prov }: { k: string; v: React.ReactNode; prov: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2 text-[14px]">
      <span className="shrink-0 text-subtle">{k}</span>
      <span className="text-right font-semibold">{v ?? <span className="text-bad">미확인</span>} <ProvenanceBadge p={prov} /></span>
    </div>
  );
}

export function PublicInfo({ lookup }: { lookup: Info }) {
  const prov = lookup.mode === "sample" ? "sample" : "public_api";
  const b = lookup.buildings;
  const land = lookup.land;
  const main = lookup.mainBuildings[0];
  return (
    <section className="space-y-5" aria-label="공공 기본정보">
      <div>
        <p className="text-[13px] font-bold text-brand-strong">대상 건물·필지 확인</p>
        <h1 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight">{lookup.address.roadAddr}</h1>
        <p className="mt-1 text-[13px] text-subtle">지번 {lookup.address.jibunAddr} · 필지고유번호(PNU) {lookup.pnu}</p>
      </div>
      <Checks checks={lookup.checks} />
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="text-[16px] font-extrabold">건축물대장</h3>
          {b.ok ? (
            <div className="divide-y divide-line">
              <Row k="용도" v={b.data.map((x) => x.mainPurpsCdNm).join(", ")} prov={prov} />
              <Row k="구조" v={main?.strctCdNm} prov={prov} />
              <Row k="대지면적" v={main?.platArea != null ? `${main.platArea}㎡` : null} prov={prov} />
              <Row k="연면적" v={main?.totArea != null ? `${main.totArea}㎡` : null} prov={prov} />
              <Row k="층수" v={main?.grndFlrCnt != null ? `지상 ${main.grndFlrCnt}층` : null} prov={prov} />
              <Row k="사용승인일" v={main?.useAprDay} prov={prov} />
            </div>
          ) : <ProviderErrorBox error={b.error} title="건축물대장" />}
        </div>
        <div>
          <h3 className="text-[16px] font-extrabold">토지특성·토지이용계획</h3>
          {land.ok ? (
            <div className="divide-y divide-line">
              <Row k="토지면적" v={land.data.lndpclAr != null ? `${land.data.lndpclAr}㎡` : null} prov={prov} />
              <Row k="지목" v={land.data.lndcgrCodeNm} prov={prov} />
              <Row k="용도지역" v={land.data.prposArea1Nm} prov={prov} />
              <Row k="도로접면" v={land.data.roadSideCodeNm} prov={prov} />
              <Row k="지형" v={[land.data.tpgrphHgCodeNm, land.data.tpgrphFrmCodeNm].filter(Boolean).join(" · ") || null} prov={prov} />
              <Row k={`공시지가(${land.data.stdrYear ?? "?"})`} v={land.data.pblntfPclnd ? `${land.data.pblntfPclnd.toLocaleString("ko-KR")}원/㎡` : null} prov={prov} />
            </div>
          ) : <ProviderErrorBox error={land.error} title="토지특성" />}
          {lookup.landUse.ok ? (
            <div className="mt-2 flex flex-wrap gap-1.5">{lookup.landUse.data.map((u, i) => <Pill key={`${u.name}-${u.conflict}-${i}`}>{u.name}({u.conflict})</Pill>)}</div>
          ) : <div className="mt-2"><ProviderErrorBox error={lookup.landUse.error} title="토지이용계획" /></div>}
          <p className="mt-2 text-[12px] text-subtle">공시지가는 참고용이며 매각가격으로 쓰지 않아요.</p>
        </div>
      </div>
      <TradeStatus label="주변 주택 거래" t={lookup.houseTrades} />
      <TradeStatus label="주변 토지 거래" t={lookup.landTrades} />
    </section>
  );
}

function TradeStatus({ label, t }: { label: string; t?: Info["houseTrades"] }) {
  if (!t) return null;
  if (!t.ok) return "error" in t ? <ProviderErrorBox error={t.error} title={label} /> : null;
  const failed = t.failedMonths ?? [];
  return (
    <p className="text-[13px] text-subtle">
      {label}: {"data" in t ? `${t.data.length}건 조회(같은 시군구, 최근 24개월)` : "조회됨"}
      {failed.length > 0 && <span className="text-warn"> · 조회 실패한 달 {failed.join(", ")} (0건이 아니라 미확인)</span>}
      {" "}· 공개 지번이 일부 가려져 있어 대상 필지의 거래 이력으로 연결하지 않아요.
    </p>
  );
}
