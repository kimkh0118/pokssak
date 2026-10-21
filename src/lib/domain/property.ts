// 주소·토지·건축물·거래 사례의 정규화된 형태. 공급자(API/예시)와 무관하게 이 형태로 다룬다.
import type { DataMode, Provenance } from "./types";

export interface AddressCandidate {
  id: string;
  roadAddr: string;
  jibunAddr: string;
  zipNo: string | null;
  admCd: string; // 10자리 법정동코드(주소 API의 행정구역코드)
  mtYn: "0" | "1"; // 0: 대지, 1: 산
  lnbrMnnm: number | null; // 지번 본번
  lnbrSlno: number | null; // 지번 부번
  bdMgtSn: string | null;
  bdNm: string | null;
  bdKdcd: "0" | "1" | null; // 1: 공동주택
  siNm: string;
  sggNm: string;
  emdNm: string;
  provenance: Provenance;
}

export interface ParcelKey {
  admCd: string;
  sigunguCd: string;
  bjdongCd: string;
  platGbCd: "0" | "1"; // 건축물대장: 0 대지, 1 산
  bun: string; // 4자리
  ji: string; // 4자리
  pnu: string; // 19자리 필지고유번호
}

export interface BuildingRecord {
  mgmBldrgstPk: string | null;
  regstrKindCdNm: string | null; // 일반건축물 / 집합건축물 등
  mainAtchGbCdNm: string | null; // 주건축물 / 부속건축물
  mainPurpsCd: string | null;
  mainPurpsCdNm: string | null;
  etcPurps: string | null;
  strctCdNm: string | null;
  totArea: number | null; // 연면적 ㎡
  platArea: number | null; // 대지면적 ㎡
  archArea: number | null;
  grndFlrCnt: number | null;
  ugrndFlrCnt: number | null;
  useAprDay: string | null; // YYYYMMDD
  hhldCnt: number | null;
  fmlyCnt: number | null;
  bldNm: string | null;
  dongNm: string | null;
  platPlc: string | null;
  newPlatPlc: string | null;
  bylotCnt: number | null; // 외필지수
}

export interface LandRecord {
  pnu: string;
  ldCodeNm: string | null;
  mnnmSlno: string | null;
  lndcgrCodeNm: string | null; // 지목
  lndpclAr: number | null; // 토지면적 ㎡
  prposArea1Nm: string | null; // 용도지역1
  prposArea2Nm: string | null;
  ladUseSittnNm: string | null;
  roadSideCodeNm: string | null;
  pblntfPclnd: number | null; // 공시지가 원/㎡
  stdrYear: string | null;
  lastUpdtDt: string | null; // 데이터 기준일자
}

export interface TradeRecord {
  kind: "house" | "land";
  sggCd: string | null;
  umdNm: string | null;
  houseType: string | null;
  jibunPartial: string | null; // 일부만 공개될 수 있음
  landArea: number | null; // 대지면적 ㎡ (토지 거래는 거래면적)
  floorArea: number | null; // 연면적 ㎡
  dealDate: string; // YYYY-MM-DD
  amountWon: number | null;
  buildYear: number | null;
  cancelled: boolean;
  dealingGbn: string | null; // 중개거래 / 직거래
  landUse?: string | null; // 토지 거래: 지목/용도지역 등
}

export type ProviderErrorKind =
  | "not_configured" // 인증키 미설정
  | "auth" // 인증 오류(미등록·만료 키 등)
  | "rate_limit" // 호출 제한 초과
  | "no_result" // 조회 결과 없음
  | "invalid_request"
  | "upstream" // 기관 시스템 오류
  | "network"
  | "parse";

export const PROVIDER_ERROR_LABEL: Record<ProviderErrorKind, string> = {
  not_configured: "인증키가 설정되지 않았습니다",
  auth: "인증 오류",
  rate_limit: "호출 제한 초과",
  no_result: "조회 결과 없음",
  invalid_request: "요청값 오류",
  upstream: "제공기관 시스템 오류",
  network: "네트워크 오류",
  parse: "응답 해석 오류",
};

export interface ProviderMeta {
  source: string; // 제공기관·서비스명
  provenance: Provenance;
  fetchedAt: string;
  asOf?: string | null;
  missingFields?: string[]; // 일부 필드 누락
  note?: string;
}

export interface ProviderError {
  kind: ProviderErrorKind;
  message: string;
  source: string;
  code?: string;
}

export type ProviderResult<T> = { ok: true; data: T; meta: ProviderMeta } | { ok: false; error: ProviderError };

export type ScopeStatus = "supported" | "unsupported" | "unconfirmed";

export interface ScopeCheck {
  status: ScopeStatus;
  reason: string;
}

export interface PropertyLookup {
  id: string;
  mode: DataMode;
  createdAt: string;
  address: AddressCandidate;
  parcel: ParcelKey | null;
  land: ProviderResult<LandRecord>;
  buildings: ProviderResult<BuildingRecord[]>;
  trades: ProviderResult<TradeRecord[]> & { monthsQueried?: string[]; failedMonths?: string[] };
  landTrades: ProviderResult<TradeRecord[]> | null;
  scope: ScopeCheck;
  /** 분석 대상 확인이 필요한 이유(여러 건물·외필지 등). 비어 있으면 확인 불필요 */
  targetReasons: string[];
  mainBuildings: BuildingRecord[];
}
