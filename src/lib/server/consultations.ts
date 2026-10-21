import "server-only";
import { PARTNERS_FOR_OPTION, SAMPLE_PARTNERS, SHAREABLE_FIELDS, type ShareableField } from "../consultation";
import type { OptionId } from "../domain/types";
import { AnalysisError, getAnalysis } from "./analyses";
import { getDb, newId } from "./db";

export interface ConsultationInput {
  analysisId: string;
  optionId: OptionId;
  partnerId: string;
  sharedFields: ShareableField[];
  contactName: string;
  contactPhone: string;
  message?: string;
  consent: boolean;
}

export function createConsultation(input: ConsultationInput) {
  if (!input.consent) throw new AnalysisError("전달 항목 확인과 동의가 필요합니다.");
  const analysis = getAnalysis(input.analysisId);
  if (!analysis) throw new AnalysisError("분석 결과를 찾을 수 없습니다.", 404);
  const partner = SAMPLE_PARTNERS.find((p) => p.id === input.partnerId);
  if (!partner) throw new AnalysisError("연결 대상을 찾을 수 없습니다.");
  if (!PARTNERS_FOR_OPTION[input.optionId]?.includes(partner.type)) throw new AnalysisError("이 선택지에 맞지 않는 연결 대상입니다.");
  const fields = input.sharedFields.filter((f) => f in SHAREABLE_FIELDS);
  if (!fields.includes("name") || !fields.includes("phone")) throw new AnalysisError("연락을 받으려면 이름과 연락처 전달에 동의해야 합니다.");
  const name = input.contactName.trim();
  const phone = input.contactPhone.replace(/[^\d-]/g, "");
  if (!name || phone.replace(/-/g, "").length < 9) throw new AnalysisError("이름과 연락처를 확인해 주세요.");
  const id = newId();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      `INSERT INTO consultation_requests (id, analysis_id, option_id, partner_type, partner_id, status, shared_fields, contact_name, contact_phone, address_shared, message, created_at)
       VALUES (?, ?, ?, ?, ?, 'received', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.analysisId,
      input.optionId,
      partner.type,
      partner.id,
      JSON.stringify(fields),
      name,
      phone,
      fields.includes("address") ? analysis.lookup.address.roadAddr : null,
      input.message?.slice(0, 1000) ?? null,
      now,
    );
  return { id, status: "received" as const, partner, sharedFields: fields, createdAt: now };
}

export function listConsultations(analysisId: string) {
  return getDb()
    .prepare("SELECT id, option_id, partner_type, partner_id, status, shared_fields, created_at FROM consultation_requests WHERE analysis_id = ? ORDER BY created_at DESC")
    .all(analysisId)
    .map((r: unknown) => {
      const row = r as Record<string, string>;
      return { ...row, shared_fields: JSON.parse(row.shared_fields) };
    });
}
