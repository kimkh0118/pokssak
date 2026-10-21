"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Answers, Condition, DataMode, MoneyInput, Occupancy, Purpose, Timing } from "@/lib/domain/types";
import { CONDITION_LABEL, OCCUPANCY_LABEL, PURPOSE_LABEL, TIMING_LABEL } from "@/lib/domain/types";
import type { AddressCandidate, PropertyLookup, ProviderResult } from "@/lib/domain/property";
import { formatArea } from "@/lib/domain/units";
import { Button, Card, ChoiceGroup, MoneyField, Notice, ProvenanceBadge, ProviderErrorBox, SampleBanner } from "./ui";

type Step = "search" | "target" | "q1" | "q2" | "q3";
const STEPS: { key: Step; label: string }[] = [
  { key: "search", label: "주소 선택" },
  { key: "target", label: "분석 대상 확인" },
  { key: "q1", label: "질문 1" },
  { key: "q2", label: "질문 2" },
  { key: "q3", label: "질문 3" },
];

const U: MoneyInput = { status: "unanswered" };

export function Wizard({ mode }: { mode: DataMode }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState(mode === "sample" ? "예시로" : "");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProviderResult<AddressCandidate[]> | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [lookup, setLookup] = useState<PropertyLookup | null>(null);
  const [buildingPk, setBuildingPk] = useState<string | null>(null);
  const [scopeConfirmed, setScopeConfirmed] = useState(false);
  const [purpose, setPurpose] = useState<Purpose | null>(null);
  const [timing, setTiming] = useState<Timing | null>(null);
  const [occupancy, setOccupancy] = useState<Occupancy | null>(null);
  const [condition, setCondition] = useState<Condition | null>(null);
  const [deposit, setDeposit] = useState<MoneyInput>(U);
  const [rent, setRent] = useState<MoneyInput>(U);
  const [leaseEnd, setLeaseEnd] = useState<string>("");
  const [leaseUnknown, setLeaseUnknown] = useState(false);
  const [cash, setCash] = useState<MoneyInput>(U);
  const [loan, setLoan] = useState<MoneyInput>(U);
  const [rate, setRate] = useState<string>("");
  const [rateUnknown, setRateUnknown] = useState(false);
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

  async function choose(a: AddressCandidate) {
    setLoadingLookup(true);
    setLookup(null);
    setBuildingPk(null);
    setScopeConfirmed(false);
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
    !!lookup && lookup.scope.status !== "unsupported" && (lookup.scope.status === "supported" || scopeConfirmed) && (!multi || !!buildingPk);

  async function submit() {
    if (!lookup || !purpose || !timing || !occupancy || !condition) return;
    setSubmitError(null);
    setSubmitting(true);
    const answers: Answers = {
      purpose,
      timing,
      occupancy,
      condition,
      tenant:
        occupancy === "tenant"
          ? {
              deposit,
              monthlyRent: rent,
              leaseEnd: leaseUnknown ? { status: "unknown" } : leaseEnd ? { status: "known", yyyymm: leaseEnd } : { status: "unanswered" },
            }
          : undefined,
      availableCash: cash,
      loanBalance: loan,
      loanRatePct: rateUnknown ? { status: "unknown" } : rate !== "" ? { status: "known", pct: Number(rate) } : { status: "unanswered" },
    };
    try {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lookupId: lookup.id, answers, target: { buildingPk, scopeConfirmedByUser: scopeConfirmed } }),
      });
      const body = await res.json();
      if (body.error) {
        setSubmitError(body.error);
        setSubmitting(false);
      } else router.push(`/analyses/${body.id}`);
    } catch {
      setSubmitError("서버에 연결하지 못했습니다.");
      setSubmitting(false);
    }
  }

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="space-y-5">
      {mode === "sample" && <SampleBanner />}
      <ol className="flex flex-wrap gap-2 text-xs" aria-label="진행 단계">
        {STEPS.map((s, i) => (
          <li key={s.key} aria-current={i === stepIndex ? "step" : undefined} className={`rounded-full px-3 py-1 ${i === stepIndex ? "bg-brand text-brand-ink" : i < stepIndex ? "bg-brand-soft text-brand" : "bg-surface text-muted border border-line"}`}>
            {i + 1}. {s.label}
          </li>
        ))}
      </ol>

      {step === "search" && (
        <Card className="space-y-4">
          <h1 className="text-lg font-bold">집 주소를 입력해 주세요</h1>
          <form onSubmit={search} className="flex flex-wrap gap-2">
            <label htmlFor="q" className="sr-only">주소 검색어</label>
            <input
              id="q"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="도로명 또는 지번 주소 (예: 세종대로 110)"
              className="min-h-10 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-brand"
            />
            <Button type="submit" disabled={searching}>{searching ? "검색 중…" : "검색"}</Button>
          </form>
          {searchError && <Notice tone="bad">{searchError}</Notice>}
          {results && !results.ok && <ProviderErrorBox error={results.error} title="주소 검색" />}
          {results?.ok && (
            <div className="space-y-2">
              {results.meta.note && <Notice tone="warn">{results.meta.note}</Notice>}
              {results.data.length === 0 && <Notice>검색 결과가 없습니다. 도로명과 건물번호를 함께 입력해 보세요.</Notice>}
              <ul className="divide-y divide-line rounded-lg border border-line">
                {results.data.map((a) => (
                  <li key={a.id}>
                    <button type="button" disabled={loadingLookup} onClick={() => choose(a)} className="w-full p-3 text-left hover:bg-bg disabled:opacity-60">
                      <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {a.roadAddr}
                        <ProvenanceBadge p={a.provenance} />
                        {a.bdKdcd === "1" && <span className="rounded bg-bad-soft px-1.5 py-0.5 text-[11px] text-bad">공동주택</span>}
                      </span>
                      <span className="block text-xs text-muted">지번: {a.jibunAddr}{a.bdNm ? ` · ${a.bdNm}` : ""}</span>
                    </button>
                  </li>
                ))}
              </ul>
              {loadingLookup && <p className="text-sm text-muted" aria-live="polite">토지·건축물·거래 사례를 조회하고 있습니다…</p>}
            </div>
          )}
        </Card>
      )}

      {step === "target" && lookup && (
        <TargetStep
          lookup={lookup}
          buildingPk={buildingPk}
          setBuildingPk={setBuildingPk}
          scopeConfirmed={scopeConfirmed}
          setScopeConfirmed={setScopeConfirmed}
          onBack={() => setStep("search")}
          onNext={() => setStep("q1")}
          ready={targetReady}
        />
      )}

      {step === "q1" && (
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">질문 1. 이 집을 앞으로 어떻게 활용하고 싶으신가요?</h2>
          <ChoiceGroup name="purpose" legend="활용 목적" value={purpose} onChange={setPurpose} options={(Object.keys(PURPOSE_LABEL) as Purpose[]).map((v) => ({ value: v, label: PURPOSE_LABEL[v] }))} />
          <ChoiceGroup name="timing" legend="희망 실행 시점" value={timing} onChange={setTiming} options={(Object.keys(TIMING_LABEL) as Timing[]).map((v) => ({ value: v, label: TIMING_LABEL[v] }))} />
          <Nav onBack={() => setStep("target")} onNext={() => setStep("q2")} nextDisabled={!purpose || !timing} />
        </Card>
      )}

      {step === "q2" && (
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">질문 2. 현재 집의 사용 상황과 상태는 어떤가요?</h2>
          <ChoiceGroup name="occupancy" legend="사용 상황" value={occupancy} onChange={setOccupancy} options={(Object.keys(OCCUPANCY_LABEL) as Occupancy[]).map((v) => ({ value: v, label: OCCUPANCY_LABEL[v] }))} />
          {occupancy === "tenant" && (
            <div className="space-y-4 rounded-lg border border-line bg-bg p-4">
              <p className="text-sm text-muted">임대차 정보(선택 입력). 모르면 &lsquo;모름&rsquo;을 선택하세요.</p>
              <MoneyField id="deposit" label="임차보증금 합계" value={deposit} onChange={setDeposit} />
              <MoneyField id="rent" label="월 임대료 합계" value={rent} onChange={setRent} allowNone="월세 없음(전세)" />
              <div className="space-y-1">
                <label htmlFor="leaseEnd" className="block text-sm font-medium">계약 종료 시점</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input id="leaseEnd" type="month" disabled={leaseUnknown} value={leaseEnd} onChange={(e) => setLeaseEnd(e.target.value)} className="rounded-lg border border-line bg-surface px-3 py-2 text-sm disabled:opacity-40" />
                  <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={leaseUnknown} onChange={(e) => setLeaseUnknown(e.target.checked)} />모름</label>
                </div>
                <p className="text-xs text-muted">여러 세대라면 가장 늦게 끝나는 계약 기준</p>
              </div>
            </div>
          )}
          <ChoiceGroup name="condition" legend="집 상태" value={condition} onChange={setCondition} options={(Object.keys(CONDITION_LABEL) as Condition[]).map((v) => ({ value: v, label: CONDITION_LABEL[v] }))} />
          <p className="text-xs text-muted">입력한 상태는 참고용이며 전문 안전진단 결과로 취급하지 않습니다.</p>
          <Nav onBack={() => setStep("q1")} onNext={() => setStep("q3")} nextDisabled={!occupancy || !condition} />
        </Card>
      )}

      {step === "q3" && (
        <Card className="space-y-5">
          <h2 className="text-lg font-bold">질문 3. 추가로 투입할 수 있는 자금과 현재 대출은 얼마인가요?</h2>
          <MoneyField id="cash" label="추가로 투입 가능한 현금" value={cash} onChange={setCash} hint="추가 대출은 자동으로 가정하지 않습니다" allowNone="0원" />
          <MoneyField id="loan" label="현재 대출 잔액(이 집 담보)" value={loan} onChange={setLoan} allowNone="대출 없음" />
          <div className="space-y-1">
            <label htmlFor="rate" className="block text-sm font-medium">대출 금리(알고 있다면)</label>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center rounded-lg border border-line bg-surface">
                <input id="rate" inputMode="decimal" disabled={rateUnknown} value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ""))} placeholder="미입력" className="tabular w-24 bg-transparent px-3 py-2 text-right text-sm outline-none disabled:opacity-40" />
                <span className="pr-3 text-sm text-muted">% / 연</span>
              </div>
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={rateUnknown} onChange={(e) => setRateUnknown(e.target.checked)} />모름</label>
            </div>
          </div>
          {submitError && <Notice tone="bad">{submitError}</Notice>}
          <Nav onBack={() => setStep("q2")} onNext={submit} nextLabel={submitting ? "계산 중…" : "결과 보기"} nextDisabled={submitting} />
        </Card>
      )}
    </div>
  );
}

function Nav({ onBack, onNext, nextDisabled, nextLabel = "다음" }: { onBack: () => void; onNext: () => void; nextDisabled?: boolean; nextLabel?: string }) {
  return (
    <div className="flex justify-between pt-2">
      <Button variant="secondary" onClick={onBack}>이전</Button>
      <Button onClick={onNext} disabled={nextDisabled}>{nextLabel}</Button>
    </div>
  );
}

function Row({ label, value, prov, sub }: { label: string; value: React.ReactNode; prov?: "public_api" | "sample" | "estimate"; sub?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-2 text-sm last:border-0">
      <span className="text-muted">{label}</span>
      <span className="text-right">
        {value ?? <span className="text-bad">정보 없음</span>} {prov && <ProvenanceBadge p={prov} />}
        {sub && <span className="block text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function TargetStep({
  lookup,
  buildingPk,
  setBuildingPk,
  scopeConfirmed,
  setScopeConfirmed,
  onBack,
  onNext,
  ready,
}: {
  lookup: PropertyLookup;
  buildingPk: string | null;
  setBuildingPk: (v: string) => void;
  scopeConfirmed: boolean;
  setScopeConfirmed: (v: boolean) => void;
  onBack: () => void;
  onNext: () => void;
  ready: boolean;
}) {
  const prov = lookup.mode === "sample" ? "sample" : "public_api";
  const land = lookup.land;
  const b = lookup.buildings;
  return (
    <Card className="space-y-5">
      <div>
        <h2 className="text-lg font-bold">분석 대상 확인</h2>
        <p className="text-sm text-muted">{lookup.address.roadAddr}</p>
      </div>

      {lookup.scope.status === "unsupported" && (
        <Notice tone="bad">
          <strong>지원 범위 밖입니다.</strong> {lookup.scope.reason}
        </Notice>
      )}
      {lookup.scope.status === "unconfirmed" && (
        <Notice tone="warn">
          <p>{lookup.scope.reason}</p>
          <label className="mt-2 flex items-center gap-2 text-ink">
            <input type="checkbox" checked={scopeConfirmed} onChange={(e) => setScopeConfirmed(e.target.checked)} />
            이 물건이 단독·다가구주택(건물 전체 소유)이 맞음을 확인합니다.
          </label>
        </Notice>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-1 text-sm font-bold">토지</h3>
          {land.ok ? (
            <div>
              <Row label="토지 면적" value={formatArea(land.data.lndpclAr)} prov={prov} />
              <Row label="지목" value={land.data.lndcgrCodeNm} prov={prov} />
              <Row label="용도지역" value={land.data.prposArea1Nm} prov={prov} />
              <Row label={`공시지가(${land.data.stdrYear ?? "?"}년)`} value={land.data.pblntfPclnd ? `${land.data.pblntfPclnd.toLocaleString("ko-KR")}원/㎡` : null} prov={prov} sub="시장 매각가가 아닙니다" />
              {land.meta.missingFields?.length ? <p className="mt-1 text-xs text-warn">일부 필드 누락: {land.meta.missingFields.join(", ")}</p> : null}
              <p className="mt-1 text-xs text-muted">출처: {land.meta.source} · 기준일 {land.meta.asOf ?? "미상"}</p>
            </div>
          ) : (
            <ProviderErrorBox error={land.error} title="토지 정보" />
          )}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold">건축물</h3>
          {b.ok ? (
            <div className="space-y-2">
              {b.data.map((x, i) => (
                <div key={x.mgmBldrgstPk ?? i} className="rounded-lg border border-line p-2">
                  <Row label="용도" value={`${x.mainPurpsCdNm ?? "?"}${x.dongNm ? ` (${x.dongNm})` : ""}`} prov={prov} sub={x.mainAtchGbCdNm ?? undefined} />
                  <Row label="구조 / 층수" value={`${x.strctCdNm ?? "?"} / 지상 ${x.grndFlrCnt ?? "?"}층`} prov={prov} />
                  <Row label="연면적" value={formatArea(x.totArea)} prov={prov} />
                  <Row label="사용승인일" value={x.useAprDay} prov={prov} />
                </div>
              ))}
              {b.meta.missingFields?.length ? <p className="text-xs text-warn">일부 필드 누락: {b.meta.missingFields.join(", ")}</p> : null}
              <p className="text-xs text-muted">출처: {b.meta.source}</p>
            </div>
          ) : (
            <ProviderErrorBox error={b.error} title="건축물 정보" />
          )}
        </div>
      </div>

      <div>
        <h3 className="mb-1 text-sm font-bold">주변 거래 사례</h3>
        {lookup.trades.ok ? (
          <p className="text-sm">
            같은 시군구 단독·다가구 매매 {lookup.trades.data.length}건 조회 <ProvenanceBadge p={lookup.mode === "sample" ? "sample" : "public_api"} />
            <span className="block text-xs text-muted">지역·계약년월 단위 자료이며 지번이 일부만 공개됩니다. 이 주소의 거래 이력이 아닙니다.{lookup.trades.meta.note ? ` · ${lookup.trades.meta.note}` : ""}</span>
          </p>
        ) : (
          <ProviderErrorBox error={lookup.trades.error} title="거래 사례" />
        )}
      </div>

      {lookup.targetReasons.length > 0 && (
        <fieldset className="space-y-2 rounded-lg border border-warn bg-warn-soft p-3">
          <legend className="px-1 text-sm font-bold text-warn">분석 대상을 선택해 주세요</legend>
          {lookup.targetReasons.map((r) => <p key={r} className="text-sm text-warn">{r}</p>)}
          {lookup.mainBuildings.length > 1 && (
            <div className="space-y-1">
              {lookup.mainBuildings.map((x) => (
                <label key={x.mgmBldrgstPk} className="flex items-center gap-2 text-sm text-ink">
                  <input type="radio" name="bldg" checked={buildingPk === x.mgmBldrgstPk} onChange={() => setBuildingPk(x.mgmBldrgstPk!)} />
                  {x.dongNm ?? x.mgmBldrgstPk} · {x.mainPurpsCdNm} · {formatArea(x.totArea)}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm text-ink">
                <input type="radio" name="bldg" checked={buildingPk === "all"} onChange={() => setBuildingPk("all")} />
                주건축물 전체를 하나로 분석(연면적 합산)
              </label>
            </div>
          )}
        </fieldset>
      )}

      <div className="flex justify-between pt-2">
        <Button variant="secondary" onClick={onBack}>다른 주소 선택</Button>
        <Button onClick={onNext} disabled={!ready}>이 대상으로 진행</Button>
      </div>
    </Card>
  );
}
