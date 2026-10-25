"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, Notice, Pill } from "./ui";

type Fields = { title: string | null; agency: string | null; regionSggs: string[] | null; summary: string | null; benefitAmount: number | null;
  benefitCap: number | null; benefitRate: number | null; applyStart: string | null; applyEnd: string | null; status: string };
type Cand = { id: string; url: string; content_type: string; important_changes: string[]; validation: { errors: string[] }; fields: Fields;
  model_version: string; parser_version: string; created_at: string; review_state: string; is_sample: number };
type Detail = { candidate: Cand & { raw_text: string; data: Record<string, { value: unknown; evidence: string | null }> };
  current: { data: Record<string, { value: unknown }>; versionNo: number } | null; fields: Record<string, string>;
  log: { action: string; actor: string; at: string; note: string | null }[] };
type Coverage = { counts: { collected: number; published: number; pending: number; extractFailed: number };
  configuredSources: { agency: string; url: string }[]; districtEnabled: boolean;
  reports: { agency: string; url: string; at: string; detail: { visited?: number; pages?: number; discovered?: number; fetched?: number; remaining?: number; status?: string; limited?: boolean; javascriptLinks?: number; attachmentFailures?: number | { url: string; name: string; reason: string }[]; errors?: { url: string; reason: string }[] } }[] };
type Jobs = { coverage: Coverage; runs: { id: string; name: string; trigger: string; status: string; started_at: string; finished_at: string | null; attempts: number; error: string | null; summary: string | null }[];
  sources: { id: string; agency: string; list_url: string; auto_fetch_allowed: number; terms_note: string }[];
  schedule: string; nextRun: string; schedulerEnabled: boolean; locks: { name: string; expires_at: string }[] };

const won = (n: number) => (n >= 10_000 ? `${(n / 10_000).toLocaleString("ko-KR")}만 원` : `${n.toLocaleString("ko-KR")}원`);
const show = (v: unknown) => (v == null ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "예" : "아니오") : String(v));

type Prog = { id: string; url: string; status: string; removedAt: string | null; removedReason: string | null; publishedAt: string;
  data: Record<string, { value: unknown } | undefined> };
const v = (p: Prog, k: string) => p.data[k]?.value;
const ENDED = ["마감", "예산소진", "취소"];
const STATUS_TONE: Record<string, string> = { 접수중: "bg-[#e8f8f0] text-good", 예정: "bg-brand-soft text-brand-strong", 미확인: "bg-fill text-muted" };

export function Admin() {
  const [error, setError] = useState<string | null>(null);
  const [cands, setCands] = useState<Cand[]>([]);
  const [failures, setFailures] = useState<{ id: string; url: string; content_type: string; extract_status: string; extract_error: string }[]>([]);
  const [open, setOpen] = useState<Detail | null>(null);
  const [jobs, setJobs] = useState<Jobs | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [progs, setProgs] = useState<Prog[]>([]);
  const [form, setForm] = useState({ title: "", agency: "", region: "", start: "", end: "", benefit: "", url: "", body: "" });

  const load = useCallback(async () => {
    try {
      const c = await api<{ candidates: Cand[]; extractFailures: typeof failures }>("/api/admin/candidates");
      setCands(c.candidates);
      setFailures(c.extractFailures);
      setProgs((await api<{ programs: Prog[] }>("/api/admin/programs")).programs);
      const fetchedJobs = await api<Jobs>("/api/admin/jobs");
      setJobs(fetchedJobs);
      return fetchedJobs;
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => { void load(); }, [load]); // eslint-disable-line react-hooks/set-state-in-effect

  useEffect(() => {
    if (!collecting && !jobs?.locks.length) return;
    const timer = setInterval(() => { void load().then((latest) => {
      if (latest && latest.locks.length === 0) {
        setCollecting(false);
        setMsg("수집이 끝났어요. 출처별 현황과 실행 결과를 확인하세요.");
      }
    }); }, 5000);
    return () => clearInterval(timer);
  }, [collecting, jobs?.locks.length, load]);

  async function collect(backfill = false) {
    setCollecting(true);
    setMsg("수집을 시작했어요. 화면을 열어 두면 현황이 갱신돼요.");
    try {
      const r = await api<{ status: string }>(`/api/admin/jobs/weekly?backfill=${backfill}`, { method: "POST" });
      setMsg(r.status === "skipped_locked" ? "이미 수집 중이에요." : "수집 중이에요. 출처별 현황은 처리되는 순서대로 갱신돼요.");
      await load();
    } catch (e) { setCollecting(false); setMsg(`실행 실패: ${(e as Error).message}`); }
  }

  if (error) return <div className="mx-auto max-w-2xl"><Notice tone="bad">{error} — 관리자 계정으로 로그인해야 해요(ADMIN_EMAILS).</Notice></div>;

  async function review(id: string, action: "approve" | "reject") {
    try {
      await api(`/api/admin/candidates/${id}`, { method: "POST", body: { action } });
      setMsg(action === "approve" ? "승인·발행했어요(이전 버전은 보존)." : "반려했어요.");
      setOpen(null);
      await load();
    } catch (e) { setMsg(`처리 실패: ${(e as Error).message}`); }
  }

  async function removeProg(p: Prog) {
    const reason = window.prompt(`'${show(v(p, "title"))}'을(를) 사용자 화면에서 뺄까요? 이유(선택)`, "");
    if (reason === null) return;
    try { await api(`/api/admin/programs/${p.id}/remove`, { method: "POST", body: { reason: reason || null } }); setMsg("삭제했어요. 아래 '삭제됨'에서 복구할 수 있어요."); await load(); }
    catch (e) { setMsg(`삭제 실패: ${(e as Error).message}`); }
  }
  async function restoreProg(p: Prog) {
    try { await api(`/api/admin/programs/${p.id}/restore`, { method: "POST" }); setMsg("복구했어요."); await load(); }
    catch (e) { setMsg(`복구 실패: ${(e as Error).message}`); }
  }
  async function addManual(publish: boolean) {
    const f = form;
    if (!f.title || !f.url.startsWith("http")) return setMsg("사업명과 공식 원문 주소(http…)는 꼭 필요해요.");
    // 구조화기가 읽는 '항목: 값' 형식으로 원문을 만든다(입력한 값만)
    const text = [`사업명: ${f.title}`, f.agency && `기관: ${f.agency}`, `관할: 부산광역시${f.region ? ` ${f.region}` : ""}`,
      f.region && `대상 지역: ${f.region}`, f.start && f.end && `신청기간: ${f.start} ~ ${f.end}`, f.benefit && `지원 내용: ${f.benefit}`,
      f.body, `출처: ${f.url}`].filter(Boolean).join("\n");
    try {
      const r = await api<{ published?: boolean; unchanged?: boolean }>("/api/admin/notices", { method: "POST",
        body: { noticeKey: `manual:${f.url}`, url: f.url, text: text.padEnd(20, " "), publish } });
      setMsg(r.unchanged ? "이미 같은 내용이 등록돼 있어요." : r.published ? "등록하고 바로 발행했어요." : "등록했어요. 검토 대기를 확인하세요.");
      setForm({ title: "", agency: "", region: "", start: "", end: "", benefit: "", url: "", body: "" });
      await load();
    } catch (e) { setMsg(`등록 실패: ${(e as Error).message}`); }
  }
  const live = progs.filter((p) => !p.removedAt && !ENDED.includes(p.status));
  const ended = progs.filter((p) => !p.removedAt && ENDED.includes(p.status));
  const removed = progs.filter((p) => p.removedAt);
  const row = (p: Prog, action: React.ReactNode) => (
    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0">
      <span className="min-w-0">
        <span className={`mr-2 rounded px-1.5 py-0.5 text-[11px] font-bold ${STATUS_TONE[p.status] ?? "bg-bad-soft text-bad"}`}>{p.status}</span>
        <a href={p.url} target="_blank" rel="noreferrer" className="font-bold underline">{show(v(p, "title"))}</a>
        <span className="block text-[12px] text-subtle">{show(v(p, "agency"))} · 대상 {show(v(p, "regionSggs"))} · 지원 {typeof v(p, "benefitCap") === "number" ? `최대 ${won(v(p, "benefitCap") as number)}` : "금액 미확인"} · 신청 {show(v(p, "applyStart"))} ~ {show(v(p, "applyEnd"))}{p.removedReason ? ` · 삭제 이유: ${p.removedReason}` : ""}</span>
      </span>
      {action}
    </li>
  );

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <h1 className="text-[26px] font-extrabold">관리자 · 지원사업 공고</h1>
      {msg && <Notice>{msg}</Notice>}

      <section className="space-y-3">
        <h2 className="text-[20px] font-extrabold">사용자에게 보이는 지원사업 {live.length}건</h2>
        <p className="text-[13px] text-subtle">신청 마감·예산 소진·취소된 사업은 그 시각부터 사용자 화면과 매칭에서 자동으로 빠져요(아래 &lsquo;기간 종료&rsquo;). 신청 기간이 없는 사업은 &lsquo;미확인&rsquo;으로 남으니 직접 확인해 주세요.</p>
        <Card>
          {live.length === 0 ? <p className="text-[14px] text-subtle">아직 발행된 사업이 없어요. 아래 검토 대기를 승인하거나 직접 추가하세요.</p>
            : <ul>{live.map((p) => row(p, <Button variant="secondary" onClick={() => void removeProg(p)}>삭제</Button>))}</ul>}
        </Card>
        {ended.length > 0 && <details><summary className="cursor-pointer text-[14px] font-bold">기간 종료(자동 제외) {ended.length}건</summary>
          <Card className="mt-2"><ul>{ended.map((p) => row(p, <Button variant="secondary" onClick={() => void removeProg(p)}>삭제</Button>))}</ul></Card></details>}
        {removed.length > 0 && <details><summary className="cursor-pointer text-[14px] font-bold">삭제됨 {removed.length}건</summary>
          <Card className="mt-2"><ul>{removed.map((p) => row(p, <Button variant="secondary" onClick={() => void restoreProg(p)}>복구</Button>))}</ul></Card></details>}
      </section>

      <section>
        <h2 className="text-[20px] font-extrabold">검토 대기 {cands.length}건</h2>
        <p className="text-[13px] text-subtle">금액·기간·대상·공공활용·사전승인·직접 수행이 새로 생기거나 바뀐 공고는 검토 후 발행돼요. 검토 전에는 기존 발행본이 유지되고 사업은 &lsquo;변경 확인 중&rsquo;이에요.</p>
        <div className="mt-3 overflow-x-auto rounded-2xl bg-surface shadow-sm ring-1 ring-line">
          <table className="w-full min-w-[860px] text-left text-[13px]">
            <thead className="bg-fill text-[12px] text-subtle">
              <tr>
                <th className="px-3 py-2">사업명</th><th className="px-3 py-2">기관 · 대상</th><th className="px-3 py-2">내용</th>
                <th className="px-3 py-2">지원금액</th><th className="px-3 py-2">신청 기한</th><th className="px-3 py-2">처리</th>
              </tr>
            </thead>
            <tbody>
              {cands.map((c) => {
                const f = c.fields;
                const money = [f.benefitCap && `최대 ${won(f.benefitCap)}`, f.benefitAmount && won(f.benefitAmount), f.benefitRate && `${f.benefitRate}%`].filter(Boolean).join(" · ");
                return (
                  <tr key={c.id} className="border-t border-line align-top">
                    <td className="px-3 py-2.5">
                      <a href={c.url} target="_blank" rel="noreferrer" className="font-bold underline">{f.title || "(사업명 없음)"}</a>
                      {c.review_state === "changing" && <span className="ml-1"><Pill tone="orange">변경 확인 중</Pill></span>}
                      {c.validation.errors.length > 0 && <span className="block text-[11px] text-warn">근거 못 찾은 항목 {c.validation.errors.length}개</span>}
                    </td>
                    <td className="px-3 py-2.5">{f.agency || "—"}<span className="block text-subtle">{f.regionSggs?.join(", ") || "대상 미확인"}</span></td>
                    <td className="max-w-[280px] px-3 py-2.5 text-muted">{f.summary ? f.summary.slice(0, 90) : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 font-bold">{money || <span className="font-normal text-subtle">미확인</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{f.applyStart || f.applyEnd ? `${f.applyStart ?? "?"} ~ ${f.applyEnd ?? "?"}` : <span className="text-subtle">미확인</span>}
                      <span className="block text-[11px] text-subtle">{f.status}</span></td>
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex gap-1">
                        <Button className="!min-h-8 !px-2.5 !text-[12px]" onClick={() => void review(c.id, "approve")}>발행</Button>
                        <Button variant="secondary" className="!min-h-8 !px-2.5 !text-[12px]" onClick={() => void review(c.id, "reject")}>반려</Button>
                        <Button variant="ghost" className="!min-h-8 !px-1 !text-[12px]" onClick={async () => setOpen(await api<Detail>(`/api/admin/candidates/${c.id}`))}>원문</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {cands.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-subtle">검토할 공고가 없어요.</td></tr>}
            </tbody>
          </table>
        </div>
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
          <div className="flex flex-wrap gap-2" aria-busy={collecting}>
            <Button disabled={collecting || jobs.locks.length > 0} onClick={() => void collect()}>지금 수집 실행</Button>
            <Button variant="secondary" disabled={collecting || jobs.locks.length > 0} onClick={() => void collect(true)}>과거 자료 심층 탐색</Button>
          </div>
          <p className="text-[13px] text-subtle" role="status">{collecting ? "수집 중 · 5초마다 현황 갱신" : "심층 탐색은 더 많은 페이지를 읽어요. 남은 목록은 다음 실행에서 이어 읽어요. 오래된 자료의 현재 접수 여부는 별도 확인이 필요해요."}</p>
          {jobs.coverage && <Card>
            <h3 className="font-bold">실제 지원사업 현황</h3>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[["수집한 공고", jobs.coverage.counts.collected], ["검토 대기", jobs.coverage.counts.pending], ["발행 완료", jobs.coverage.counts.published], ["원문 추출 실패", jobs.coverage.counts.extractFailed]].map(([label, count]) => <div key={label}><dt className="text-[13px] text-subtle">{label}</dt><dd className="text-xl font-bold">{count}건</dd></div>)}
            </dl>
            <p className="mt-3 text-[13px] text-subtle">구·군 탐색 {jobs.coverage.districtEnabled ? "켜짐" : "꺼짐"} · 설정된 공식 출처 {jobs.coverage.configuredSources.length}곳. 수집한 공고는 관리자 검토·발행 후 사용자에게 표시돼요.</p>
            <ul className="mt-3 space-y-3 text-[13px]">
              {jobs.coverage.configuredSources.map((source) => {
                const latest = jobs.coverage.reports.find((r) => r.url === source.url);
                const d = latest?.detail;
                return <li key={source.url} className="border-t border-line pt-2">
                  <a href={source.url} target="_blank" rel="noreferrer" className="font-bold underline">{source.agency}</a>
                  {d ? <><p>탐색 {d.visited ?? d.pages ?? 0}페이지 · 발견 {d.discovered ?? 0}개 · 신규·변경 {d.fetched ?? 0}개 · 미탐색 {d.remaining ?? 0}개 · {d.status ?? "완료"}{d.limited ? " · 실행 한도 도달" : ""}</p>
                    <p className="text-subtle">확인: {new Date(latest!.at).toLocaleString("ko-KR")}{d.javascriptLinks ? ` · 자동으로 읽지 못한 JavaScript 링크 ${d.javascriptLinks}개` : ""}</p>
                    {!!d.errors?.length && <details><summary className="cursor-pointer text-warn">접근·추출 확인 필요 {d.errors.length}건</summary><ul className="break-words">{d.errors.map((e, i) => <li key={i}>{e.url} — {e.reason}</li>)}</ul></details>}
                  </> : <p className="text-subtle">아직 실행 기록 없음</p>}
                </li>;
              })}
            </ul>
          </Card>}

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

      <section className="space-y-3">
        <h2 className="text-[20px] font-extrabold">지원사업 직접 추가</h2>
        <p className="text-[13px] text-subtle">자동 수집이 못 찾은 사업(robots로 막힌 구청, 보도자료로만 나온 사업 등)을 공식 원문 주소와 함께 넣어요. 원문에 있는 내용만 적어 주세요.</p>
        <Card className="space-y-2">
          <input type="text" placeholder="사업명 (필수) 예: 2026년 빈집 철거 지원사업" aria-label="사업명 (필수) 예: 2026년 빈집 철거 지원사업" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
          <div className="grid gap-2 sm:grid-cols-2">
            <input type="text" placeholder="기관 예: 부산광역시 남구 건축과" aria-label="기관 예: 부산광역시 남구 건축과" value={form.agency} onChange={(e) => setForm({ ...form, agency: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
            <input type="text" placeholder="대상 구·군 예: 남구 (비우면 부산 전체)" aria-label="대상 구·군 예: 남구 (비우면 부산 전체)" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-[13px] font-bold">신청 시작<input type="date" placeholder="신청 시작" aria-label="신청 시작" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" /></label>
            <label className="text-[13px] font-bold">신청 마감 (지나면 자동 제외)<input type="date" placeholder="신청 마감" aria-label="신청 마감" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" /></label>
          </div>
          <input type="text" placeholder="지원 내용 예: 철거비 최대 1,400만원" aria-label="지원 내용 예: 철거비 최대 1,400만원" value={form.benefit} onChange={(e) => setForm({ ...form, benefit: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
          <input type="url" placeholder="공식 원문 주소 (필수) https://…" aria-label="공식 원문 주소 (필수) https://…" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} className="block h-11 w-full rounded-xl bg-fill px-3" />
          <textarea placeholder="원문 내용(선택): 대상·조건·신청 방법 등" aria-label="원문 내용" rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="block w-full rounded-xl bg-fill p-3" />
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void addManual(true)}>추가하고 바로 발행</Button>
            <Button variant="secondary" onClick={() => void addManual(false)}>검토 대기로 추가</Button>
          </div>
        </Card>
      </section>
    </div>
  );
}
