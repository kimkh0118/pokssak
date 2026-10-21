import { createAnalysis } from "@/lib/server/analyses";
import { errorResponse } from "@/lib/server/respond";
import { validateAnswers } from "@/lib/analysis/validate";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const answers = validateAnswers(body.answers);
    if (typeof body.lookupId !== "string") return Response.json({ error: "lookupId가 필요합니다." }, { status: 400 });
    const a = createAnalysis(body.lookupId, answers, {
      buildingPk: typeof body.target?.buildingPk === "string" ? body.target.buildingPk : null,
      scopeConfirmedByUser: body.target?.scopeConfirmedByUser === true,
    });
    return Response.json({ id: a.id });
  } catch (e) {
    return errorResponse(e);
  }
}
