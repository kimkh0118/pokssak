"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Address, Condition, DelayReason, Fetched, Mode, PropertyLookup, Purpose } from "@/lib/api";
import { CONDITION_LABEL, DELAY_REASON_LABEL, PURPOSE_HINT, PURPOSE_LABEL } from "@/lib/labels";

const Q1: Purpose[] = ["quick_sale", "profit", "live", "undecided"];
import { formatArea } from "@/lib/format";
import { addHistory } from "@/lib/history";
import { BottomBar, Button, ChoiceGroup, Notice, Pill, ProvenanceBadge, ProviderErrorBox, SampleBanner } from "./ui";

type Step = "search" | "target" | "q1" | "q2" | "q3";
const STEPS: { key: Step; label: string }[] = [
  { key: "search", label: "주소 선택" },
  { key: "target", label: "분석 대상 확인" },
  { key: "q1", label: "질문 1" },
  { key: "q2", label: "질문 2" },
  { key: "q3", label: "질문 3" },
];


export function Wizard({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState(mode === "sample" ? "예시로" : "");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Fetched<Address[]> | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [lookup, setLookup] = useState<PropertyLookup | null>(null);
  const [buildingPk, setBuildingPk] = useState<string | null>(null);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [delayReason, setDelayReason] = useState<DelayReason | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setSearchError(null);
    setResults(null);
    if (query.trim().length < 2) return setSearchError("검색어를 두 글자 이상 입력해 주세요.");
    setSearching(true);
    try {
      const res = await fetch(`/api/address?mode=${mode}&q=${encodeURIComponent(query.trim())}`);
      const body = await res.json();
      // 요청 검증 오류는 { error: string }, 공급자 오류는 { ok: false, error: {...} } 형태
      if (typeof body.error === "string") setSearchError(body.error);
      else setResults(body);
    } catch {
      setSearchError("서버에 연결하지 못했습니다.");
    } finally {
      setSearching(false);
    }
  }

  async function choose(a: Address) {
    setLoadingLookup(true);
    setLookup(null);
    setBuildingPk(null);
    try {
      const res = await fetch("/api/property", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, address: a }) });
      const body = await res.json();
      if (body.error) setSearchError(body.error);
      else {
        setLookup(body);
        if (body.mainBuildings?.length === 1) setBuildingPk(body.mainBuildings[0].mgmBldrgstPk);
        setStep("target");
      }
    } catch {
      setSearchError("서버에 연결하지 못했습니다.");
    } finally {
      setLoadingLookup(false);
    }
  }

  const multi = (lookup?.mainBuildings.length ?? 0) > 1;
  const targetReady =
    !!lookup && lookup.scope.status !== "unsupported" && (!multi || !!buildingPk);

  async function submit() {
    if (!lookup || !purpose || !condition || !delayReason) return;
    setSubmitError(null);
    setSubmitting(true);
    // 사용 상황·희망 시점·자금은 결과 화면의 '계산 조건 수정'에서 선택 입력
    const answers = { purpose, condition, delayReason };
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupId: lookup.id, answers, target: { buildingPk } }),
      });
      const body = await res.json();
      if (body.error) {
        setSubmitError(body.error);
        setSubmitting(false);
      } else {
        addHistory({ id: body.id, address: lookup.address.roadAddr, mode });
        router.push(`/analyses/${body.id}`);
      }
    } catch {
      setSubmitError("서버에 연결하지 못했습니다.");
      setSubmitting(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const progress = ((stepIndex + 1) / STEPS.length) * 100;

  return (
    <div className="mx-auto max-w-xl">
      {mode === "sample" && <SampleBanner />}
      <div className="mb-6">
        <div className="flex items-center justify-between text-[13px] font-bold">
          <span className="text-brand">{STEPS[stepIndex].label}</span>
          <span className="text-subtle">
            {stepIndex + 1} / {STEPS.length}
          </span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-fill" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1} aria-label="진행 단계">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {step === "search" && (
        <div className="space-y-5">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">
            집 주소를
            <br />
            입력해 주세요
          </h1>
          <form onSubmit={search} className="flex items-center gap-2 rounded-2xl bg-fill pl-4 pr-2 focus-within:ring-2 focus-within:ring-brand">
            <label htmlFor="q" className="sr-only">주소 검색어</label>
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="도로명 또는 지번 (예: 세종대로 110)"
              className="h-14 min-w-0 flex-1 bg-transparent text-[17px] font-semibold outline-none placeholder:font-medium placeholder:text-subtle"
            />
            <Button type="submit" disabled={searching} className="h-10 min-h-10 px-4">{searching ? "검색 중" : "검색"}</Button>
          </form>
          {searchError && <Notice tone="bad">{searchError}</Notice>}
          {results && !results.ok && <ProviderErrorBox error={results.error} title="주소 검색" />}
          {results?.ok && (
            <div className="space-y-3">
              {results.meta.note && <Notice tone="warn">{results.meta.note}</Notice>}
              {results.data.length === 0 && <Notice>검색 결과가 없어요. 도로명과 건물번호를 함께 입력해 보세요.</Notice>}
              <ul className="divide-y divide-line">
                {results.data.map((a) => (
                  <li key={a.id}>
                    <button type="button" disabled={loadingLookup} onClick={() => choose(a)} className="flex w-full items-center justify-between gap-3 py-4 text-left disabled:opacity-60">
                      <span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[16px] font-bold">
                          {a.roadAddr}
                          {a.bdKdcd === "1" && <Pill tone="red">공동주택</Pill>}
                        </span>
                        <span className="mt-0.5 block text-[13px] text-subtle">
                          지번 {a.jibunAddr}
                          {a.bdNm ? ` · ${a.bdNm}` : ""} <ProvenanceBadge p={a.provenance} />
                        </span>
                      </span>
                      <span aria-hidden className="text-[22px] text-subtle">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              {loadingLookup && <p className="text-[14px] font-semibold text-brand" aria-live="polite">토지·건축물·거래 사례를 조회하고 있어요…</p>}
            </div>
          )}
        </div>
      )}

      {step === "target" && lookup && (
        <TargetStep
          lookup={lookup}
          buildingPk={buildingPk}
          setBuildingPk={setBuildingPk}
          onBack={() => setStep("search")}
          onRetry={lookup.land.ok && lookup.buildings.ok && lookup.trades.ok ? undefined : () => choose(lookup.address)}
          retrying={loadingLookup}
          onNext={() => setStep("q1")}
          ready={targetReady}
        />
      )}

      {step === "q1" && (
        <div className="space-y-8">
          <QTitle n={1}>이 집을<br />어떻게 하고 싶나요?</QTitle>
          <ChoiceGroup name="purpose" legend="하나를 골라 주세요" value={purpose} onChange={setPurpose}
            options={Q1.map((v) => ({ value: v, label: PURPOSE_LABEL[v], hint: PURPOSE_HINT[v] }))} />
          <Nav onBack={() => setStep("target")} onNext={() => setStep("q2")} nextDisabled={!purpose} />
        </div>
      )}

      {step === "q2" && (
        <div className="space-y-8">
          <QTitle n={2}>현재 집 상태는<br />어떤가요?</QTitle>
          <ChoiceGroup name="condition" legend="하나를 골라 주세요" columns={2} value={condition} onChange={setCondition}
            options={(Object.keys(CONDITION_LABEL) as Condition[]).map((v) => ({ value: v, label: CONDITION_LABEL[v] }))} />
          <p className="-mt-4 text-[13px] text-subtle">입력한 상태는 참고용이에요. 전문 안전진단 결과로 보지 않아요.</p>
          <Nav onBack={() => setStep("q1")} onNext={() => setStep("q3")} nextDisabled={!condition} />
        </div>
      )}

      {step === "q3" && (
        <div className="space-y-8">
          <QTitle n={3}>지금까지 처리를 미룬<br />가장 큰 이유는 뭔가요?</QTitle>
          <ChoiceGroup name="delayReason" legend="하나를 골라 주세요" columns={2} value={delayReason} onChange={setDelayReason}
            options={(Object.keys(DELAY_REASON_LABEL) as DelayReason[]).map((v) => ({ value: v, label: DELAY_REASON_LABEL[v] }))} />
          {submitError && <Notice tone="bad">{submitError}</Notice>}
          <Nav onBack={() => setStep("q2")} onNext={submit} nextLabel={submitting ? "계산하고 있어요…" : "결과 보기"} nextDisabled={!delayReason || submitting} />
        </div>
      )}
    </div>
  );
}

function QTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="text-[26px] font-extrabold leading-tight tracking-tight">
      <span className="sr-only">질문 {n}. </span>
      {children}
    </h2>
  );
}

function Nav({ onBack, onNext, nextDisabled, nextLabel = "다음" }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <BottomBar>
      <Button variant="secondary" size="lg" onClick={onBack} className="w-28">이전</Button>
      <Button size="lg" onClick={onNext} disabled={nextDisabled} className="flex-1">{nextLabel}</Button>
    </BottomBar>
  );
}

function Row({ label, value, prov, sub }: { label: string; value: React.ReactNode; prov?: "public_api" | "sample" | "estimate"; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 text-[15px]">
      <span className="shrink-0 text-subtle">{label}</span>
      <span className="text-right font-semibold">
        {value ?? <span className="text-bad">정보 없음</span>} {prov && <ProvenanceBadge p={prov} />}
        {sub && <span className="block text-[12px] font-normal text-subtle">{sub}</span>}
      </span>
    </div>
  );
}

function TargetStep({
  lookup,
  buildingPk,
  setBuildingPk,
  onBack,
  onNext,
  onRetry,
  retrying,
  ready,
}: {
  lookup: PropertyLookup;
  buildingPk: string | null;
  setBuildingPk: (v: string) => void;
  onBack: () => void;
  onRetry?: () => void;
  retrying?: boolean;
  onNext: () => void;
  ready: boolean;
}) {
  const prov = lookup.mode === "sample" ? "sample" : "public_api";
  const land = lookup.land;
  const b = lookup.buildings;
  const main = b.ok ? b.data.filter((x) => !x.mainAtchGbCdNm || x.mainAtchGbCdNm.includes("주건축물")) : [];
  const headline = main[0]?.mainPurpsCdNm ?? (lookup.scope.status === "unsupported" ? "지원 범위 밖" : "건축물 정보 확인 필요");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[14px] font-extrabold text-brand">분석 대상 확인</p>
        <h1 className="mt-1 text-[24px] font-extrabold leading-tight tracking-tight">{lookup.address.roadAddr}</h1>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Pill tone={lookup.scope.status === "supported" ? "blue" : lookup.scope.status === "unsupported" ? "red" : "orange"}>{headline}</Pill>
          {land.ok && land.data.lndpclAr && <Pill>대지 {formatArea(land.data.lndpclAr)}</Pill>}
          {main[0]?.useAprDay && <Pill>{main[0].useAprDay.slice(0, 4)}년 사용승인</Pill>}
        </div>
      </div>

      {lookup.scope.status === "unsupported" && (
        <Notice tone="bad">
          <strong className="block text-[15px]">이 물건은 아직 분석할 수 없어요</strong>
          {lookup.scope.reason}
        </Notice>
      )}
      {lookup.scope.status === "unconfirmed" && (
        <Notice tone="warn">
          <p>{lookup.scope.reason}</p>
          {onRetry && (
            <button type="button" onClick={onRetry} disabled={retrying} className="mt-3 rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50">
              {retrying ? "다시 조회하는 중…" : "다시 조회"}
            </button>
          )}
        </Notice>
      )}

      {lookup.targetReasons.length > 0 && (
        <fieldset className="space-y-3 rounded-2xl bg-warn-soft p-5">
          <legend className="sr-only">분석 대상 선택</legend>
          <p className="text-[16px] font-extrabold text-ink">어떤 건물을 분석할까요?</p>
          {lookup.targetReasons.map((r) => <p key={r} className="text-[14px] text-warn">{r}</p>)}
          {lookup.mainBuildings.length > 1 && (
            <div className="space-y-2">
              {[...lookup.mainBuildings.map((x) => ({ pk: x.mgmBldrgstPk!, label: `${x.dongNm ?? x.mgmBldrgstPk} · ${x.mainPurpsCdNm}`, sub: formatArea(x.totArea) })), { pk: "all", label: "주건축물 전체를 하나로", sub: "연면적 합산" }].map((o) => {
                const on = buildingPk === o.pk;
                return (
                  <label key={o.pk} className={`flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-[15px] font-bold ${on ? "bg-surface text-brand ring-2 ring-brand" : "bg-surface text-ink"}`}>
                    <span>{o.label}<span className="block text-[13px] font-normal text-subtle">{o.sub}</span></span>
                    <input type="radio" name="bldg" className="sr-only" checked={on} onChange={() => setBuildingPk(o.pk)} />
                    <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full text-[13px] ${on ? "bg-brand text-white" : "text-transparent ring-1 ring-line"}`}>✓</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      )}

      <section>
        <h3 className="text-[17px] font-extrabold">토지</h3>
        {land.ok ? (
          <div className="mt-1 divide-y divide-line">
            <Row label="토지 면적" value={formatArea(land.data.lndpclAr)} prov={prov} />
            <Row label="지목" value={land.data.lndcgrCodeNm} prov={prov} />
            <Row label="용도지역" value={land.data.prposArea1Nm} prov={prov} />
            <Row label={`공시지가(${land.data.stdrYear ?? "?"}년)`} value={land.data.pblntfPclnd ? `${land.data.pblntfPclnd.toLocaleString("ko-KR")}원/㎡` : null} prov={prov} sub="시장 매각가가 아니에요" />
            {land.meta.missingFields?.length ? <p className="py-2 text-[12px] text-warn">일부 필드 누락: {land.meta.missingFields.join(", ")}</p> : null}
            <p className="py-2 text-[12px] text-subtle">출처 {land.meta.source} · 기준일 {land.meta.asOf ?? "미상"}</p>
          </div>
        ) : (
          <div className="mt-2"><ProviderErrorBox error={land.error} title="토지 정보" /></div>
        )}
      </section>

      <section>
        <h3 className="text-[17px] font-extrabold">건축물</h3>
        {b.ok ? (
          <div className="mt-2 space-y-2">
            {b.data.map((x, i) => (
              <div key={x.mgmBldrgstPk ?? i} className="divide-y divide-line rounded-2xl bg-fill/60 px-4 py-1">
                <Row label="용도" value={`${x.mainPurpsCdNm ?? "?"}${x.dongNm ? ` (${x.dongNm})` : ""}`} prov={prov} sub={x.mainAtchGbCdNm ?? undefined} />
                <Row label="구조 / 층수" value={`${x.strctCdNm ?? "?"} / 지상 ${x.grndFlrCnt ?? "?"}층`} prov={prov} />
                <Row label="연면적" value={formatArea(x.totArea)} prov={prov} />
                <Row label="사용승인일" value={x.useAprDay} prov={prov} />
              </div>
            ))}
            {b.meta.missingFields?.length ? <p className="text-[12px] text-warn">일부 필드 누락: {b.meta.missingFields.join(", ")}</p> : null}
            <p className="text-[12px] text-subtle">출처 {b.meta.source}</p>
          </div>
        ) : (
          <div className="mt-2"><ProviderErrorBox error={b.error} title="건축물 정보" /></div>
        )}
      </section>

      <section>
        <h3 className="text-[17px] font-extrabold">주변 거래 사례</h3>
        {lookup.trades.ok ? (
          <p className="mt-2 text-[15px]">
            같은 시군구 단독·다가구 매매 <strong className="text-brand">{lookup.trades.data.length}건</strong> 조회 <ProvenanceBadge p={prov} />
            <span className="mt-1 block text-[12px] text-subtle">지역·계약년월 단위 자료이고 지번이 일부만 공개돼요. 이 주소의 거래 이력이 아니에요.{lookup.trades.meta.note ? ` · ${lookup.trades.meta.note}` : ""}</span>
          </p>
        ) : (
          <div className="mt-2"><ProviderErrorBox error={lookup.trades.error} title="거래 사례" /></div>
        )}
      </section>

      <BottomBar>
        <Button variant="secondary" size="lg" onClick={onBack} className="w-28">다른 주소</Button>
        <Button size="lg" onClick={onNext} disabled={!ready} className="flex-1">이 집으로 진행</Button>
      </BottomBar>
    </div>
  );
}
