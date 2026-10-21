"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Notice, Pill } from "./ui";

type Cand = { id: string; url: string; content_type: string; important_changes: string[]; validation: { errors: string[] };
  model_version: string; parser_version: string; created_at: string; review_state: string; is_sample: number };
type Detail = { candidate: Cand & { raw_text: string; data: Record<string, { value: unknown; evidence: string | null }> };
  current: { data: Record<string, { value: unknown }>; versionNo: number } | null; fields: Record<string, string>;
  log: { action: string; actor: string; at: string; note: string | null }[] };
type Jobs = { runs: { id: string; name: string; trigger: string; status: string; started_at: string; finished_at: string | null; attempts: number; error: string | null; summary: string | null }[];
  sources: { id: string; agency: string; list_url: string; auto_fetch_allowed: number; terms_note: string }[];
  schedule: string; nextRun: string; schedulerEnabled: boolean; locks: { name: string; expires_at: string }[] };

const show = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "예" : "아니오") : String(v));

export function Admin() {
  const [error, setError] = useState<string | null>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [failures, setFailures] = useState<{ id: string; url: string; content_type: string; extract_status: string; extract_error: string }[]>([]);
  const [open, setOpen] = useState<Detail | null>(null);
  const [jobs, setJobs] = useState<Jobs | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState({ noticeKey: "", url: "", text: "" });

  const load = useCallback(async () => {
    try {
      const c = await api<{ candidates: Cand[]; extractFailures: typeof failures }>("/api/admin/candidates");
      setCands(c.candidates);
      setFailures(c.extractFailures);
      setJobs(await api<Jobs>("/api/admin/jobs"));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  if (error) return <div className="mx-auto max-w-2xl"><Notice tone="bad">{error} — 관리자 계정으로 로그인해야 해요(ADMIN_EMAILS).</Notice></div>;

  async function review(id: string, action: "approve" | "reject") {
    try {
      await api(`/api/admin/candidates/${id}`, { method: "POST", body: { action } });
      setMsg(action === "approve" ? "승인·발행했어요(이전 버전은 보존)." : "반려했어요.");
      setOpen(null);
      await load();
    } catch (e) { setMsg(`처리 실패: ${(e as Error).message}`); }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-[26px] font-extrabold">관리자 · 지원사업 공고</h1>
      {msg && <Notice>{msg}</Notice>}

      <section>
        <h2 className="text-[20px] font-extrabold">검토 대기 {cands.length}건</h2>
        <p className="text-[13px] text-subtle">금액·기간·대상·공공활용·사전승인·직접 수행이 새로 생기거나 바뀐 공고는 검토 후 발행돼요. 검토 전에는 기존 발행본이 유지되고 사업은 &lsquo;변경 확인 중&rsquo;이에요.</p>
        <ul className="mt-3 space-y-2">
          {cands.map((c) => (
            <li key={c.id}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold">{c.url}{c.is_sample ? " (예시)" : ""}</span>
                  <span className="flex gap-1.5">{c.review_state === "changing" && <Pill tone="orange">변경 확인 중</Pill>}<Pill>{c.content_type}</Pill></span>
                </div>
                <p className="mt-1 text-[13px] text-muted">중요 항목: {c.important_changes.join(", ") || "없음"} · 모델 {c.model_version} · 파서 {c.parser_version}</p>
                {c.validation.errors.length > 0 && <p className="text-[13px] text-warn">근거 검증: {c.validation.errors.join(" / ")}</p>}
                <Button variant="secondary" className="mt-2" onClick={async () => setOpen(await api<Detail>(`/api/admin/candidates/${c.id}`))}>원문과 비교</Button>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      {open && (
        <section className="grid gap-4 md:grid-cols-2" aria-label="원문과 추출 결과 비교">
          <Card>
            <h3 className="font-extrabold">원문</h3>
            <pre className="mt-2 max-h-[480px] overflow-auto whitespace-pre-wrap text-[13px]">{open.candidate.raw_text}</pre>
          </Card>
          <Card>
            <h3 className="font-extrabold">추출 결과{open.current && ` (현재 발행 v${open.current.versionNo}와 비교)`}</h3>
            <table className="mt-2 w-full text-[13px]">
              <tbody>
                {Object.entries(open.fields).map(([k, label]) => {
                  const v = open.candidate.data[k];
                  const cur = open.current?.data[k]?.value;
                  const changed = open.current && show(cur) !== show(v?.value);
                  return (
                    <tr key={k} className={`border-t border-line align-top ${changed ? "bg-warn-soft" : ""}`}>
                      <th scope="row" className="py-1 pr-2 text-left font-normal text-subtle">{label}</th>
                      <td className="py-1">{show(v?.value)}{changed && <span className="block text-[11px] text-warn">이전: {show(cur)}</span>}
                        {v?.evidence && <span className="block text-[11px] text-subtle">근거: “{v.evidence}”</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex gap-2">
              <Button onClick={() => review(open.candidate.id, "approve")}>승인·발행</Button>
              <Button variant="secondary" onClick={() => review(open.candidate.id, "reject")}>반려</Button>
            </div>
          </Card>
        </section>
      )}

      {failures.length > 0 && (
        <section>
          <h2 className="text-[18px] font-extrabold">추출 실패 첨부</h2>
          <ul className="mt-2 space-y-1 text-[14px]">{failures.map((f) => <li key={f.id}>· {f.url} ({f.content_type}) — {f.extract_status}: {f.extract_error}</li>)}</ul>
        </section>
      )}

      {jobs && (
        <section className="space-y-3">
          <h2 className="text-[20px] font-extrabold">수집 작업</h2>
          <p className="text-[14px]">예약: 매주 {jobs.schedule} (한국 시간) · 다음 실행 {new Date(jobs.nextRun).toLocaleString("ko-KR")} · 예약 실행 {jobs.schedulerEnabled ? "켜짐" : "꺼짐"}
            {jobs.locks.length > 0 && <span className="text-warn"> · 실행 중 잠금 있음</span>}</p>
          <Button onClick={async () => { setMsg("수동 실행 중…"); try { const r = await api<{ status: string }>("/api/admin/jobs/weekly", { method: "POST" }); setMsg(`수동 실행 결과: ${r.status}`); await load(); } catch (e) { setMsg(`실행 실패: ${(e as Error).message}`); } }}>지금 수집 실행</Button>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead><tr className="text-left text-subtle"><th>시작</th><th>방식</th><th>상태</th><th>시도</th><th>요약·오류</th></tr></thead>
              <tbody>{jobs.runs.map((r) => (
                <tr key={r.id} className="border-t border-line align-top"><td className="py-1">{new Date(r.started_at).toLocaleString("ko-KR")}</td><td>{r.trigger}</td>
                  <td>{r.status}</td><td>{r.attempts}</td><td className="max-w-[360px] break-words">{r.error ?? r.summary}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <h3 className="pt-2 font-bold">공식 출처</h3>
          <ul className="text-[13px]">{jobs.sources.map((s) => <li key={s.id}>· {s.agency} {s.list_url} — 자동 수집 {s.auto_fetch_allowed ? "허용" : "꺼짐"} ({s.terms_note})</li>)}</ul>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-[20px] font-extrabold">공고 수동 등록</h2>
        <p className="text-[13px] text-subtle">자동 수집 조건이 불명확한 공식 공고를 허용된 범위에서 원문 그대로 붙여 넣어요. 등록 후 검토 대기로 들어가요.</p>
        <input placeholder="공고 식별자" value={notice.noticeKey} onChange={(e) => setNotice({ ...notice, noticeKey: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
        <input placeholder="원문 URL" value={notice.url} onChange={(e) => setNotice({ ...notice, url: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
        <textarea placeholder="공고 원문" rows={6} value={notice.text} onChange={(e) => setNotice({ ...notice, text: e.target.value })} className="block w-full rounded-xl bg-fill p-3" />
        <Button onClick={async () => { try { await api("/api/admin/notices", { method: "POST", body: notice }); setMsg("등록했어요. 검토 대기를 확인하세요."); await load(); } catch (e) { setMsg(`등록 실패: ${(e as Error).message}`); } }}>등록</Button>
      </section>
    </div>
  );
}
