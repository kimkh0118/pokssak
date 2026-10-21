import "server-only";
import { AnalysisError } from "./analyses";
import { ValidationError } from "../analysis/validate";

export function errorResponse(e: unknown) {
  if (e instanceof AnalysisError || e instanceof ValidationError) return Response.json({ error: e.message }, { status: e.status });
  if (e instanceof SyntaxError) return Response.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  console.error("[api] unexpected error", (e as Error)?.message);
  return Response.json({ error: "요청을 처리하지 못했습니다." }, { status: 500 });
}

export const parseMode = (v: unknown): "live" | "sample" | null => (v === "live" || v === "sample" ? v : null);
