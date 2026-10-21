import "server-only";
import type { Answers } from "../domain/types";
import type { PropertyLookup } from "../domain/property";
import { buildInput, type BuiltInput, type Overrides, type Target } from "../analysis/buildInput";
import { analyze, type AnalysisResult } from "../engine/analyze";
import { getDb, newId } from "./db";
import { getLookup } from "./lookup";

export interface StoredAnalysis {
  id: string;
  lookupId: string;
  mode: PropertyLookup["mode"];
  createdAt: string;
  updatedAt: string;
  answers: Answers;
  overrides: Overrides;
  target: Target;
  lookup: PropertyLookup;
  built: Omit<BuiltInput, "engineInput"> & { engineInput: BuiltInput["engineInput"] };
  result: AnalysisResult;
}

export class AnalysisError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function compute(lookup: PropertyLookup, answers: Answers, target: Target, overrides: Overrides) {
  const built = buildInput(lookup, answers, target, overrides);
  const result = analyze(built.engineInput);
  return { built, result };
}

export function createAnalysis(lookupId: string, answers: Answers, target: Target, overrides: Overrides = {}): StoredAnalysis {
  const lookup = getLookup(lookupId);
  if (!lookup) throw new AnalysisError("조회 기록을 찾을 수 없습니다. 주소부터 다시 진행해 주세요.", 404);
  if (lookup.scope.status === "unsupported") throw new AnalysisError(`지원 범위 밖의 물건입니다: ${lookup.scope.reason}`, 422);
  if (lookup.scope.status === "unconfirmed" && !target.scopeConfirmedByUser)
    throw new AnalysisError("단독·다가구주택인지 확인이 필요합니다.", 422);
  if (lookup.mainBuildings.length > 1 && !target.buildingPk) throw new AnalysisError("분석할 건물을 선택해 주세요.", 422);
  const { built, result } = compute(lookup, answers, target, overrides);
  const id = newId();
  const now = new Date().toISOString();
  getDb()
    .prepare(
      "INSERT INTO analyses (id, lookup_id, mode, created_at, updated_at, answers, overrides, target, result) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(id, lookupId, lookup.mode, now, now, JSON.stringify(answers), JSON.stringify(overrides), JSON.stringify(target), JSON.stringify({ built, result }));
  return { id, lookupId, mode: lookup.mode, createdAt: now, updatedAt: now, answers, overrides, target, lookup, built, result };
}

export function getAnalysis(id: string): StoredAnalysis | null {
  const row = getDb().prepare("SELECT * FROM analyses WHERE id = ?").get(id) as
    | { id: string; lookup_id: string; mode: "live" | "sample"; created_at: string; updated_at: string; answers: string; overrides: string; target: string; result: string }
    | undefined;
  if (!row) return null;
  const lookup = getLookup(row.lookup_id);
  if (!lookup) return null;
  const { built, result } = JSON.parse(row.result);
  return {
    id: row.id,
    lookupId: row.lookup_id,
    mode: row.mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    answers: JSON.parse(row.answers),
    overrides: JSON.parse(row.overrides),
    target: JSON.parse(row.target),
    lookup,
    built,
    result,
  };
}

/** 계산 조건 수정 → 같은 함수로 다시 계산해 저장 */
export function updateAnalysis(id: string, overrides: Overrides, answers?: Answers): StoredAnalysis {
  const cur = getAnalysis(id);
  if (!cur) throw new AnalysisError("분석 결과를 찾을 수 없습니다.", 404);
  const nextAnswers = answers ?? cur.answers;
  const { built, result } = compute(cur.lookup, nextAnswers, cur.target, overrides);
  const now = new Date().toISOString();
  getDb()
    .prepare("UPDATE analyses SET overrides = ?, answers = ?, result = ?, updated_at = ? WHERE id = ?")
    .run(JSON.stringify(overrides), JSON.stringify(nextAnswers), JSON.stringify({ built, result }), now, id);
  return { ...cur, answers: nextAnswers, overrides, built, result, updatedAt: now };
}
