import type { NextRequest } from "next/server";
import { getAnalysis } from "@/lib/server/analyses";

// 내 분석 목록용 요약. 개인정보(연락처 등)는 포함하지 않는다.
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .filter((x) => /^[0-9a-f-]{36}$/i.test(x))
    .slice(0, 30);
  const items = ids.map((id) => {
    const a = getAnalysis(id);
    if (!a) return { id, found: false as const };
    const rec = a.result.recommendation;
    const top = a.result.options.find((o) => o.id === rec.optionId);
    return {
      id,
      found: true as const,
      mode: a.mode,
      address: a.lookup.address.roadAddr,
      updatedAt: a.updatedAt,
      verdict: rec.verdict,
      optionLabel: top?.variantLabel ?? null,
      comparisonValue: top && top.computable ? top.scenarios.base.comparisonValue : null,
    };
  });
  return Response.json({ items });
}
