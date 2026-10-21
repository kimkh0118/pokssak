"""요청 검증. 금액은 원, 면적은 ㎡. '미확인(unknown)'·'0원'·'적용 없음(none)'을 구분한다."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Kind = Literal["consult", "public", "assumption", "unknown", "none", "rule"]


class Evidence(BaseModel):
    """값 또는 범위 + 단위·출처 종류·출처·기준일·범위·포함/제외 항목. 사용자가 기록한 상담값은 전문가 검증이 아니다."""
    kind: Kind
    value: float | None = Field(default=None, ge=0, le=1e13)
    min: float | None = Field(default=None, ge=0, le=1e13)
    max: float | None = Field(default=None, ge=0, le=1e13)
    unit: str = "원"
    source: str | None = Field(default=None, max_length=200)      # 상담 경로(예: ○○공인중개사)
    checkedOn: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    scope: str | None = Field(default=None, max_length=200)
    includes: list[str] = []
    excludes: list[str] = []
    # 가격 상담 전용
    priceType: Literal["as_is", "land"] | None = None
    scopeMatches: bool | None = None
    siteConditionShared: bool | None = None
    wishPrice: bool | None = None
    # 견적 전용
    items: dict[str, Literal["included", "excluded", "excluded_na", "unknown"]] | None = None
    siteWorkConfirmed: bool | None = None
    note: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def _shape(self):
        if self.min is not None and self.max is not None and self.min > self.max:
            raise ValueError("범위의 최소값이 최대값보다 큽니다.")
        if self.kind not in ("unknown", "none") and self.value is None and (self.min is None or self.max is None):
            raise ValueError("값 또는 범위(최소·최대)를 입력하세요. 모르면 '미확인'을 고르세요.")
        return self


class Answers(BaseModel):
    ownership: Literal["single", "joint", "other"]
    corporate: bool = False          # 법인 명의
    ownerMismatch: bool = False      # 건물·토지 소유자 불일치
    usage: Literal["vacant", "storage", "occupied", "unknown"]
    storageFollowup: dict | None = None  # {inUse: yes|no|unknown, cleanupKnown: yes|no}
    direction: Literal["recovery", "fast", "undecided"]
    condition: Literal["usable", "old", "severe", "unknown"]
    access: Literal["good", "narrow", "none", "unknown"]
    vacancyMonths: int | None = Field(default=None, ge=0, le=600)


class Scope(BaseModel):
    buildingKey: str | None = None
    costsSeparable: bool = False


class LookupRequest(BaseModel):
    mode: Literal["live", "sample"]
    address: dict


class CreateAnalysis(BaseModel):
    lookupId: str
    answers: Answers
    scope: Scope = Scope()


class UpdateAnalysis(BaseModel):
    inputs: dict | None = None       # 필드명 → 근거(검증은 서버에서 Evidence 로)
    answers: dict | None = None


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)


class NotificationSettings(BaseModel):
    in_app: bool = True
    email: bool = False
    sms: bool = False
    push: bool = False


class ManualNotice(BaseModel):
    noticeKey: str = Field(min_length=3, max_length=200)
    url: str = Field(min_length=8, max_length=500)
    text: str = Field(min_length=20, max_length=200_000)
    postedAt: str | None = None


class ReviewAction(BaseModel):
    action: Literal["approve", "reject"]
    note: str | None = None
    edited: dict | None = None
