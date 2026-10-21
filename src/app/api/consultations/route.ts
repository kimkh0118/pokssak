import { createConsultation } from "@/lib/server/consultations";
import { errorResponse } from "@/lib/server/respond";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const r = createConsultation({
      analysisId: String(b.analysisId ?? ""),
      optionId: b.optionId,
      partnerId: String(b.partnerId ?? ""),
      sharedFields: Array.isArray(b.sharedFields) ? b.sharedFields : [],
      contactName: String(b.contactName ?? ""),
      contactPhone: String(b.contactPhone ?? ""),
      message: typeof b.message === "string" ? b.message : undefined,
      consent: b.consent === true,
    });
    return Response.json(r);
  } catch (e) {
    return errorResponse(e);
  }
}
