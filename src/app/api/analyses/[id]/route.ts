import type { NextRequest } from "next/server";
import { getAnalysis, updateAnalysis } from "@/lib/server/analyses";
import { listConsultations } from "@/lib/server/consultations";
import { errorResponse } from "@/lib/server/respond";
import { validateAnswers, validateOverrides } from "@/lib/analysis/validate";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const a = getAnalysis(id);
  if (!a) return Response.json({ error: "분석 결과를 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ...a, consultations: listConsultations(id) });
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const overrides = validateOverrides(body.overrides ?? {});
    const answers = body.answers ? validateAnswers(body.answers) : undefined;
    const a = updateAnalysis(id, overrides, answers);
    return Response.json({ ...a, consultations: listConsultations(id) });
  } catch (e) {
    return errorResponse(e);
  }
}
