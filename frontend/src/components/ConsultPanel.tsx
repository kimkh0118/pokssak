"use client";

import { useEffect, useState } from "react";
import { api, type Analysis, type OptionId, type Partner } from "@/lib/api";
import { OPTION_LABEL, PARTNER_TYPE_LABEL, SHAREABLE_FIELDS, type ShareableField } from "@/lib/labels";
import { Button, Card, Notice } from "./ui";

type Received = { id: string; partner: Partner; sharedFields: ShareableField[]; createdAt: string };

type PartnerList = { partners: Partner[]; forOption: Record<OptionId, Partner["type"][]> };

export function ConsultPanel({ data }: { data: Analysis }) {
  const rec = data.result.recommendation.optionId;
  const [option, setOption] = useState<OptionId>(rec ?? "sell_as_is");
  const [partner, setPartner] = useState<Partner | null>(null);
  const [fields, setFields] = useState<ShareableField[]>(["name", "phone"]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Received[]>([]);
  const [sending, setSending] = useState(false);
  const [list, setList] = useState<PartnerList | null>(null);

  // 연결 대상(예시 업체)은 백엔드가 정한다
  useEffect(() => {
    api<PartnerList>("/api/partners").then(setList).catch(() => setError("연결 대상을 불러오지 못했습니다."));
  }, []);

  const types = list?.forOption[option] ?? [];
  const partners = (list?.partners ?? []).filter((p) => types.includes(p.type));

  async function submit() {
    if (!partner) return;
    setError(null);
    setSending(true);
    try {
      const r = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId: data.id, optionId: option, partnerId: partner.id, sharedFields: fields, contactName: name, contactPhone: phone, message, consent }),
      });
      const b = await r.json();
      if (b.error) setError(b.error);
      else {
        setDone((d) => [b, ...d]);
        setPartner(null);
        setConsent(false);
      }
    } catch {
      setError("서버에 연결하지 못했습니다.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="font-bold">전문가 상담 신청(선택)</h2>
        <p className="text-sm text-muted">직접 신청할 때만 진행됩니다. 분석 화면을 보는 것만으로는 어떤 정보도 업체에 전달되지 않습니다.</p>
      </div>
      <Notice tone="warn">현재 실제 업체와 연동되어 있지 않습니다. 신청 내용은 이 서비스에 저장되고 &lsquo;신청 접수&rsquo; 상태로만 표시됩니다. 아래 업체는 모두 예시입니다.</Notice>

      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="상담할 선택지">
        {(Object.keys(OPTION_LABEL) as OptionId[]).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={option === o} onClick={() => { setOption(o); setPartner(null); }}
            className={`rounded-full border px-3 py-1 text-sm ${option === o ? "border-brand bg-brand-soft text-brand" : "border-line"}`}>
            {OPTION_LABEL[o]}
          </button>
        ))}
      </div>

      {!list ? (
        <p className="text-sm text-muted">연결 대상을 불러오는 중…</p>
      ) : types.length === 0 ? (
        <p className="text-sm">현상태 유지는 별도 연결 없이 결과 확인으로 마칩니다.</p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm">{option === "demolish_sell_land" ? "철거업체 상담 후, 토지 매각을 위한 공인중개사 상담도 신청할 수 있습니다." : `연결 대상: ${types.map((t) => PARTNER_TYPE_LABEL[t]).join(", ")}`}</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {partners.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-lg border border-line p-3 text-sm">
                <span>{p.name} <span className="rounded bg-sample-soft px-1 text-[11px] text-sample">예시 업체</span><span className="block text-xs text-muted">{PARTNER_TYPE_LABEL[p.type]}</span></span>
                <Button variant="secondary" onClick={() => setPartner(p)}>신청서 작성</Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {partner && (
        <div className="space-y-3 rounded-lg border border-brand p-4" role="dialog" aria-label="상담 신청 내용 확인">
          <h3 className="font-bold">전달 대상: {partner.name} <span className="text-xs font-normal text-sample">(예시 업체)</span></h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">이름<input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded border border-line bg-surface px-2 py-1.5" /></label>
            <label className="text-sm">연락처<input value={phone} inputMode="tel" onChange={(e) => setPhone(e.target.value)} className="mt-1 block w-full rounded border border-line bg-surface px-2 py-1.5" /></label>
          </div>
          <label className="block text-sm">요청 사항(선택)<textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={2} className="mt-1 block w-full rounded border border-line bg-surface px-2 py-1.5" /></label>
          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">업체에 전달할 항목</legend>
            {(Object.keys(SHAREABLE_FIELDS) as ShareableField[]).map((f) => (
              <label key={f} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={fields.includes(f)} onChange={(e) => setFields((s) => (e.target.checked ? [...s, f] : s.filter((x) => x !== f)))} />
                {SHAREABLE_FIELDS[f]}{f === "address" ? `: ${data.property.address.roadAddr}` : ""}
              </label>
            ))}
          </fieldset>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            위 전달 대상과 체크한 항목을 확인했고, 상담 신청을 위해 저장하는 데 동의합니다.
          </label>
          {error && <Notice tone="bad">{error}</Notice>}
          <div className="flex gap-2">
            <Button onClick={submit} disabled={!consent || sending}>{sending ? "저장 중…" : "상담 신청"}</Button>
            <Button variant="secondary" onClick={() => setPartner(null)}>취소</Button>
          </div>
        </div>
      )}

      {(done.length > 0 || data.consultations.length > 0) && (
        <div className="space-y-1 text-sm" aria-live="polite">
          <h3 className="font-medium">신청 내역</h3>
          {done.map((d) => (
            <p key={d.id} className="text-brand">신청 접수 · {d.partner.name}(예시) · 전달 항목: {d.sharedFields.map((f) => SHAREABLE_FIELDS[f]).join(", ")} — 업체 연결은 아직 이뤄지지 않았습니다.</p>
          ))}
          {data.consultations.filter((c) => !done.some((d) => d.id === c.id)).map((c) => (
            <p key={c.id} className="text-muted">신청 접수 · {PARTNER_TYPE_LABEL[c.partnerType as Partner["type"]]} · {new Date(c.createdAt).toLocaleString("ko-KR")}</p>
          ))}
        </div>
      )}
    </Card>
  );
}
