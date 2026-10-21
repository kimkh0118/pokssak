"use client";

import type { Check, Fetched, Lookup } from "@/lib/api";
import { Pill, ProvenanceBadge, ProviderErrorBox } from "./ui";

const CHECK_TONE = { pass: "green", fail: "red", unknown: "orange" } as const;
const CHECK_TEXT = { pass: "충족", fail: "해당 안 됨", unknown: "확인 필요" } as const;

type Info = Pick<Lookup, "address" | "pnu" | "buildings" | "land" | "landUse" | "mainBuildings" | "checks"> & {
  houseTrades?: Fetched<unknown[]> | { ok: boolean; failedMonths?: string[] };
  landTrades?: Fetched<unknown[]> | { ok: boolean; failedMonths?: string[] };
  mode: string;
};

export function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2">
      {checks.map((c) => (
        <li key={c.key} className="rounded-xl bg-fill p-3">
          <div className="flex items-center justify-between gap-2 text-[14px] font-bold">{c.label}<Pill tone={CHECK_TONE[c.status]}>{CHECK_TEXT[c.status]}</Pill></div>
          <p className="mt-1 text-[12px] text-subtle">{c.detail}</p>
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
        <p className="text-[13px] font-bold text-brand">대상 건물·필지 확인</p>
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
            <div className="mt-2 flex flex-wrap gap-1.5">{lookup.landUse.data.map((u) => <Pill key={u.name}>{u.name}({u.conflict})</Pill>)}</div>
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
