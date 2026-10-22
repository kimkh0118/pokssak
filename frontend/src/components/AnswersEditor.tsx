"use client";

import { useState } from "react";
import { api, type Analysis, type Answers } from "@/lib/api";
import { QUESTIONS } from "@/lib/labels";
import { Button, Card, Notice } from "./ui";

// 결과 화면에서 네 질문 답을 고치고 다시 계산
export function AnswersEditor({ data, onSaved }: { data: Analysis; onSaved: (a: Analysis) => void }) {
  const [a, setA] = useState<Answers>(() => ({ ...data.answers }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Answers>(k: K, v: Answers[K]) => setA((s) => ({ ...s, [k]: v }));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { scope, ...answers } = a; // eslint-disable-line @typescript-eslint/no-unused-vars
      onSaved(await api<Analysis>(`/api/analyses/${data.id}`, { method: "PUT", body: { answers } }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const select = <K extends "ownership" | "usage" | "direction" | "condition" | "access">(k: K, label: string) => (
    <label className="block text-[14px] font-semibold">
      {label}
      <select value={a[k] as string} onChange={(e) => set(k, e.target.value as Answers[K])}
        className="mt-1 block h-11 w-full rounded-xl bg-fill px-3 text-[15px]">
        {Object.entries(QUESTIONS[k].options).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );

  return (
    <Card className="space-y-4">
      <div id="answers">
        <h2 className="text-[20px] font-extrabold">질문 답 수정</h2>
        <p className="mt-1 text-[13px] text-subtle">응답은 공적 인증이 아니에요. 바꾸면 분석 경로와 결과를 다시 계산해요.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {select("ownership", "1. 소유 형태(건물·매각 토지 모두)")}
        {select("usage", "2. 사용 상태")}
        {select("direction", "2. 우선하는 방향")}
        {select("condition", "3. 건물 상태")}
        {select("access", "4. 공사차량 진입")}
        <label className="block text-[14px] font-semibold">비어 있던 기간(개월)
          <input type="number" min={0} value={a.vacancyMonths ?? ""} onChange={(e) => set("vacancyMonths", e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 block h-11 w-full rounded-xl bg-fill px-3 text-[15px]" />
        </label>
      </div>
      <div className="space-y-2 rounded-xl bg-fill p-3 text-[14px]">
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={!!a.corporate} onChange={(e) => set("corporate", e.target.checked)} />법인 명의예요</label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={!!a.ownerMismatch} onChange={(e) => set("ownerMismatch", e.target.checked)} />건물과 토지의 소유자가 달라요</label>
      </div>
      {a.usage === "storage" && (
        <div className="space-y-2 rounded-xl ring-1 ring-line p-3 text-[14px]">
          <p className="font-bold">짐 보관 추가 확인</p>
          <label className="flex flex-wrap items-center gap-2">짐 외에 실제로 집을 쓰는 사람이 있나요?
            <select value={a.storageFollowup?.inUse ?? ""} onChange={(e) => set("storageFollowup", { ...a.storageFollowup, inUse: e.target.value })} className="h-9 rounded-lg bg-fill px-2">
              <option value="">선택</option><option value="no">없어요(사용하지 않음)</option><option value="yes">있어요</option><option value="unknown">모름</option>
            </select>
          </label>
          <label className="flex flex-wrap items-center gap-2">짐 정리 범위·비용을 알고 있나요?
            <select value={a.storageFollowup?.cleanupKnown ?? ""} onChange={(e) => set("storageFollowup", { ...a.storageFollowup, cleanupKnown: e.target.value })} className="h-9 rounded-lg bg-fill px-2">
              <option value="">선택</option><option value="yes">예</option><option value="no">아니요</option>
            </select>
          </label>
        </div>
      )}
      {error && <Notice tone="bad">{error}</Notice>}
      <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? "다시 계산하는 중…" : "답 저장하고 다시 계산"}</Button></div>
    </Card>
  );
}
