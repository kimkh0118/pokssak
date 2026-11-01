"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, type Address, type Answers, type Fetched, type Lookup } from "@/lib/api";
import { QUESTIONS } from "@/lib/labels";
import { AddressPlate, AddressSign, plateTitle } from "./AddressSign";
import { BottomBar, Button, ChoiceGroup, Notice, Pill, ProviderErrorBox } from "./ui";
import { PublicInfo } from "./PublicInfo";

type Step = "address" | "target" | "intro" | "q1" | "q2" | "q3" | "q4";
const STEP_LABEL: Record<Step, string> = { address: "주소", target: "정보 제공", intro: "질문", q1: "질문 1", q2: "질문 2", q3: "질문 3", q4: "질문 4" };
const ORDER: Step[] = ["address", "target", "intro", "q1", "q2", "q3", "q4"];
const mode = "live";
// 진행 표시는 사용자가 이해하는 세 덩어리로(주소 → 정보 확인 → 질문)
const GROUPS = [{ label: "주소", first: 0, last: 0 }, { label: "정보 확인", first: 1, last: 1 }, { label: "질문 4개", first: 2, last: 6 }];
const LOOKUP_STEPS = ["주소·지번 확인", "건축물대장", "토지특성·공시지가", "토지이용계획", "주택 실거래(최근 2년)", "토지 실거래(최근 2년)"];

export function Flow({ initialQuery }: { initialQuery?: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("address");
  const [q, setQ] = useState(initialQuery ?? "");
  const [found, setFound] = useState<Fetched<Address[]> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [buildingKey, setBuildingKey] = useState<string | null>(null);
  const [costsSeparable, setCostsSeparable] = useState(false);
  const [a, setA] = useState<Partial<Answers>>({ corporate: false, ownerMismatch: false });
  const [watch, setWatch] = useState<"idle" | "saving" | "new" | "existing">("idle");

  // 첫 화면에서 주소를 넣고 넘어오면 바로 검색(예전에는 한 번 더 눌러야 했음)
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current || !initialQuery || initialQuery.trim().length < 2) return;
    autoRan.current = true;
    void search(initialQuery);
  }, [initialQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  async function search(text: string = q) {
    setError(null);
    setFound(null);
    if (text.trim().length < 2) return setError("주소를 두 글자 이상 입력해 주세요. 예: 해운대로 570, 우동 655-1");
    setBusy(true);
    try {
      const res = await fetch(`/api/address?mode=${mode}&q=${encodeURIComponent(text.trim())}`);
      const body = await res.json();
      if (typeof body.error === "string") setError(body.error);
      else setFound(body);
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  async function choose(addr: Address) {
    setBusy(true);
    setError(null);
    try {
      const lk = await api<Lookup>("/api/lookup", { method: "POST", body: { mode, address: addr } });
      setLookup(lk);
      setBuildingKey(lk.mainBuildings.length === 1 ? lk.mainBuildings[0].mgmBldrgstPk : null);
      setCostsSeparable(lk.mainBuildings.length <= 1 && !lk.mainBuildings.some((b) => (b.bylotCnt ?? 0) > 0));
      setWatch("idle");
      setStep("target");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // 정보 확인 단계에서 바로 관심 집으로 저장(질문은 나중에 결과 화면에서 답할 수 있음)
  async function saveWatch() {
    if (!lookup) return;
    setWatch("saving");
    setError(null);
    try {
      const out = await api<{ saved: { created: boolean } }>(`/api/lookups/${lookup.id}/watch`, {
        method: "POST", body: { buildingKey, costsSeparable },
      });
      setWatch(out.saved.created ? "new" : "existing");
    } catch (e) {
      setError((e as Error).message);
      setWatch("idle");
    }
  }

  async function submit() {
    if (!lookup) return;
    setBusy(true);
    setError(null);
    try {
      const out = await api<{ id: string; saved: { created: boolean } | null; loggedIn: boolean }>("/api/analyses", {
        method: "POST",
        body: { lookupId: lookup.id, answers: a, scope: { buildingKey, costsSeparable } },
      });
      router.push(`/analyses/${out.id}${out.saved ? `?saved=${out.saved.created ? "new" : "existing"}` : ""}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  const idx = ORDER.indexOf(step);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((s) => ({ ...s, [k]: v }));
  const multi = (lookup?.mainBuildings.length ?? 0) > 1;
  const typeFail = lookup?.checks.find((c) => c.key === "type")?.status === "fail";

  return (
    <div className="mx-auto max-w-md">
      <ol className="mb-6 flex gap-1" aria-label={`진행 단계 ${idx + 1}/${ORDER.length}: ${STEP_LABEL[step]}`}>
        {GROUPS.map((g) => {
          const state = idx > g.last ? "done" : idx >= g.first ? "now" : "todo";
          return (
            <li key={g.label} className="flex-1">
              <span className={`block h-1.5 rounded-full ${state === "todo" ? "bg-line" : state === "now" ? "bg-sign" : "bg-sign/40"}`} />
              <span className={`mt-1.5 block text-[12px] font-bold ${state === "now" ? "text-sign" : "text-subtle"}`}>{g.label}</span>
            </li>
          );
        })}
      </ol>
      {error && <div className="mb-4"><Notice tone="bad">{error}</Notice></div>}

      {step === "address" && (
        <div className="space-y-5">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-tight">빈집 주소를 알려주세요</h1>
          <AddressSign value={q} onChange={setQ} onSubmit={() => void search()} busy={busy} autoFocus={!initialQuery} cta="주소 검색하기" />
          {found && !found.ok && <ProviderErrorBox error={found.error} title="주소 검색" />}
          {found?.ok && (
            <section aria-label="주소 후보">
              {found.meta.note && <Notice tone="warn">{found.meta.note}</Notice>}
              {found.data.length === 0 && <Notice>검색 결과가 없어요. 도로명과 건물번호를 함께 입력해 보세요.</Notice>}
              {found.data.length > 0 && !busy && <p className="mb-2 text-[13px] text-subtle">{found.data.length}개의 검색 결과가 있어요. 빈집 주소를 골라 주세요.</p>}
              {!busy && <ul className="space-y-2">
                {found.data.map((ad) => (
                  <li key={ad.id}>
                    <button type="button" disabled={busy} onClick={() => choose(ad)} className="flex w-full items-center justify-between gap-3 rounded-xl bg-surface px-4 py-3 text-left shadow-sm ring-1 ring-line transition hover:ring-2 hover:ring-brand disabled:opacity-60">
                      <span>
                        <span className="block text-[12px] text-subtle">{ad.roadAddr}</span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[17px] font-extrabold">
                          {plateTitle(ad.jibunAddr, ad.roadAddr)} {ad.bdKdcd === "1" && <Pill tone="red">공동주택</Pill>}
                        </span>
                      </span>
                      <span aria-hidden className="text-[22px] text-subtle">›</span>
                    </button>
                  </li>
                ))}
              </ul>}
              {busy && found?.ok && <LookupProgress />}
            </section>
          )}
        </div>
      )}

      {step === "target" && lookup && (
        <div className="space-y-6">
          <AddressPlate title={plateTitle(lookup.address.jibunAddr, lookup.address.roadAddr)} sub={lookup.address.roadAddr} />
          <div className="rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line"><PublicInfo lookup={lookup} /></div>
          {multi && (
            <fieldset className="space-y-2 rounded-2xl bg-warn-soft p-5">
              <legend className="sr-only">분석 대상 건물</legend>
              <p className="text-[16px] font-extrabold">분석할 건물을 골라 주세요</p>
              {lookup.mainBuildings.map((b) => (
                <label key={b.mgmBldrgstPk} className={`flex cursor-pointer items-center justify-between rounded-xl bg-surface px-4 py-3 text-[15px] font-bold ${buildingKey === b.mgmBldrgstPk ? "ring-2 ring-brand" : ""}`}>
                  <span>{b.dongNm ?? b.mgmBldrgstPk} · {b.mainPurpsCdNm} · 연면적 {b.totArea}㎡</span>
                  <input type="radio" name="bldg" checked={buildingKey === b.mgmBldrgstPk} onChange={() => setBuildingKey(b.mgmBldrgstPk)} />
                </label>
              ))}
              <label className="flex items-start gap-2 pt-1 text-[14px]">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={costsSeparable} onChange={(e) => setCostsSeparable(e.target.checked)} />
                선택한 건물·필지의 가격과 철거 비용을 다른 건물과 구분해 상담받을 수 있어요(구분할 수 없으면 금액 추천을 보류합니다)
              </label>
            </fieldset>
          )}
          {watch === "new" || watch === "existing" ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 shadow-sm ring-1 ring-line">
              <p className="text-[15px] font-bold">♥ {watch === "new" ? "관심 집에 저장했어요" : "이미 관심 집에 있어요"}</p>
              <Link href="/my" className="shrink-0 text-[14px] font-bold text-brand-strong">관심 집 보기 ›</Link>
            </div>
          ) : (
            <button type="button" onClick={() => void saveWatch()} disabled={watch === "saving" || (multi && !buildingKey)}
              className="press flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-surface text-[15px] font-bold shadow-sm ring-1 ring-line disabled:opacity-50">
              <span aria-hidden className="text-brand">♡</span>{watch === "saving" ? "저장하는 중…" : "관심 집에 저장하기"}
            </button>
          )}
          {typeFail && <Notice tone="bad">이 물건은 맞춤 분석 대상(부산 단독·다가구주택)이 아니어서 금액 추천은 보류되지만, 공개 기본정보와 확인 경로는 계속 볼 수 있어요.</Notice>}
          <BottomBar>
            <Button variant="secondary" size="lg" className="w-28" onClick={() => setStep("address")}>다른 주소</Button>
            <Button size="lg" className="flex-1" disabled={multi && !buildingKey} onClick={() => setStep("intro")}>다음</Button>
          </BottomBar>
        </div>
      )}

      {step === "intro" && (
        <div className="mx-auto max-w-sm rounded-2xl bg-surface p-5 shadow-lg ring-1 ring-line">
          <p className="text-[20px] font-extrabold">잠깐, 질문이 있어요</p>
          <p className="mt-1 text-[13px] text-subtle">더 좋은 결과를 위해서 수집하는 정보예요. 네 가지만 답하면 돼요.</p>
          <Button className="mt-4 w-full" onClick={() => setStep("q1")}>다음</Button>
          <button type="button" className="mt-2 w-full text-[13px] text-subtle underline" onClick={() => setStep("target")}>이전으로</button>
        </div>
      )}

      {step === "q1" && (
        <div className="space-y-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-6">
          <QTitle n={1} text={QUESTIONS.ownership.title} hint={QUESTIONS.ownership.hint} />
          <ChoiceGroup name="ownership" legend="소유 형태" value={a.ownership ?? null} onChange={(v) => set("ownership", v)}
            options={Object.entries(QUESTIONS.ownership.options).map(([value, label]) => ({ value: value as Answers["ownership"], label }))} />
          <fieldset className="space-y-2 rounded-2xl bg-fill p-4 text-[15px]">
            <legend className="sr-only">추가 확인</legend>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={!!a.corporate} onChange={(e) => set("corporate", e.target.checked)} />법인 명의예요</label>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={!!a.ownerMismatch} onChange={(e) => set("ownerMismatch", e.target.checked)} />건물과 토지의 소유자가 달라요</label>
            <p className="text-[12px] text-subtle">상속으로 받은 집도 단독소유라면 분석할 수 있어요. 응답은 공적 인증이 아니에요.</p>
          </fieldset>
          <Nav back={() => setStep("intro")} next={() => setStep("q2")} disabled={!a.ownership} />
        </div>
      )}

      {step === "q2" && (
        <div className="space-y-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-6">
          <QTitle n={2} text="현재 집의 사용 상태와 원하는 방향은 무엇인가요?" />
          <ChoiceGroup name="usage" legend={QUESTIONS.usage.title} columns={2} value={a.usage ?? null} onChange={(v) => set("usage", v)}
            options={Object.entries(QUESTIONS.usage.options).map(([value, label]) => ({ value: value as Answers["usage"], label }))} />
          {a.usage === "storage" && (
            <fieldset className="space-y-3 rounded-2xl ring-1 ring-line p-4 text-[15px]">
              <legend className="px-1 font-bold">짐 보관 추가 확인</legend>
              <YesNo label="짐 외에 실제로 집을 쓰는 사람이 없나요?" value={{ no: "yes", yes: "no", unknown: "unknown" }[a.storageFollowup?.inUse ?? ""]}
                onChange={(v) => set("storageFollowup", { ...a.storageFollowup, inUse: { yes: "no", no: "yes", unknown: "unknown" }[v] })} />
              <YesNo label="짐 정리 범위와 비용을 알고 있나요?" value={a.storageFollowup?.cleanupKnown}
                onChange={(v) => set("storageFollowup", { ...a.storageFollowup, cleanupKnown: v })} />
              <p className="text-[12px] text-subtle">짐을 보관 중이면 자동으로 &lsquo;미사용&rsquo;으로 보지 않아요. 정리비는 결과 화면에서 입력해요.</p>
            </fieldset>
          )}
          <ChoiceGroup name="direction" legend={QUESTIONS.direction.title} columns={2} value={a.direction ?? null} onChange={(v) => set("direction", v)}
            options={Object.entries(QUESTIONS.direction.options).map(([value, label]) => ({ value: value as Answers["direction"], label }))} />
          <label className="block text-[15px] font-bold">
            비어 있던 기간(개월, 아는 경우)
            <input type="number" min={0} inputMode="numeric" value={a.vacancyMonths ?? ""} onChange={(e) => set("vacancyMonths", e.target.value === "" ? null : Number(e.target.value))}
              className="mt-2 block h-12 w-40 rounded-xl bg-fill px-4 text-[17px] font-bold outline-none focus:ring-2 focus:ring-brand" />
            <span className="mt-1 block text-[12px] font-normal text-subtle">빈집 철거 지원 조건(보통 1년 이상 비어 있음) 확인에 참고해요. 모르면 비워 두세요.</span>
          </label>
          <Nav back={() => setStep("q1")} next={() => setStep("q3")} disabled={!a.usage || !a.direction} />
        </div>
      )}

      {step === "q3" && (
        <div className="space-y-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-6">
          <QTitle n={3} text={QUESTIONS.condition.title} hint="입력한 상태는 안전진단 결과가 아니며, 상태만으로 가격을 0원으로 바꾸거나 철거를 권하지 않아요." />
          <ChoiceGroup name="condition" legend="건물 상태" columns={2} value={a.condition ?? null} onChange={(v) => set("condition", v)}
            options={Object.entries(QUESTIONS.condition.options).map(([value, label]) => ({ value: value as Answers["condition"], label }))} />
          <Nav back={() => setStep("q2")} next={() => setStep("q4")} disabled={!a.condition} />
        </div>
      )}

      {step === "q4" && (
        <div className="space-y-6 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line sm:p-6">
          <QTitle n={4} text={QUESTIONS.access.title} hint="철거 견적·현장 작업 가능성 확인에 쓰여요." />
          <ChoiceGroup name="access" legend="차량 진입" columns={2} value={a.access ?? null} onChange={(v) => set("access", v)}
            options={Object.entries(QUESTIONS.access.options).map(([value, label]) => ({ value: value as Answers["access"], label }))} />
          <Nav back={() => setStep("q3")} next={submit} disabled={!a.access || busy} label={busy ? "비교하고 있어요…" : "완료"} />
        </div>
      )}
    </div>
  );
}

function QTitle({ n, text, hint }: { n: number; text: string; hint?: string }) {
  return (
    <div>
      <p className="flex justify-between text-[12px] font-bold text-subtle"><span className="text-brand-strong">질문</span><span>{n}/4</span></p>
      <h2 className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight">Q{n}. {text}</h2>
      {hint && <p className="mt-2 text-[14px] text-subtle">{hint}</p>}
    </div>
  );
}

function Nav({ back, next, disabled, label = "다음" }: { back: () => void; next: () => void; disabled?: boolean; label?: string }) {
  return (
    <BottomBar>
      <Button variant="secondary" size="lg" className="w-28" onClick={back}>이전</Button>
      <Button size="lg" className="flex-1" onClick={next} disabled={disabled}>{label}</Button>
    </BottomBar>
  );
}

function YesNo({ label, value, onChange }: { label: string; value?: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <div className="mt-2 flex gap-2">
        {[["yes", "예"], ["no", "아니요"], ["unknown", "모름"]].map(([v, t]) => (
          <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
            className={`rounded-full px-4 py-2 text-[14px] font-bold ${value === v ? "bg-ink text-white" : "bg-fill text-muted"}`}>{t}</button>
        ))}
      </div>
    </div>
  );
}

// 공공자료 6종 조회 중: 무엇을 확인하고 있는지 보여준다(보통 5~15초)
function LookupProgress() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((v) => Math.min(v + 1, LOOKUP_STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div role="status" aria-live="polite" className="mt-4 rounded-2xl bg-surface p-5 shadow-sm ring-1 ring-line">
      <p className="text-[16px] font-extrabold">공공자료 6종을 확인하고 있어요</p>
      <p className="mt-0.5 text-[13px] text-subtle">기관 서버 상태에 따라 5~15초 걸려요.</p>
      <ul className="mt-3 space-y-1.5 text-[14px]">
        {LOOKUP_STEPS.map((label, i) => (
          <li key={label} className={`flex items-center gap-2 ${i > n ? "text-subtle" : "text-ink"}`}>
            <span aria-hidden className={`grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold ${i < n ? "bg-sign text-white" : i === n ? "border-2 border-sign border-t-transparent animate-spin motion-reduce:animate-none" : "bg-fill"}`}>{i < n ? "✓" : ""}</span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}
