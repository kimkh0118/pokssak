"""요청 본문 검증(Pydantic). 금액은 원 단위. 0원과 '모름'·'미입력'을 구분한다."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Mode = Literal["live", "sample"]


class Money(BaseModel):
    """known: 금액을 앎(0원 포함) / unknown: 모름 / unanswered: 입력 안 함"""

    status: Literal["known", "unknown", "unanswered"] = "unanswered"
    won: float | None = Field(default=None, ge=0, le=1e13)

    @model_validator(mode="after")
    def _known_needs_amount(self):
        if self.status == "known" and self.won is None:
            raise ValueError("금액을 입력해 주세요.")
        return self

    @property
    def value(self) -> float | None:
        return round(self.won) if self.status == "known" else None


class Rate(BaseModel):
    status: Literal["known", "unknown", "unanswered"] = "unanswered"
    pct: float | None = Field(default=None, ge=0, le=30)


class LeaseEnd(BaseModel):
    status: Literal["known", "unknown", "unanswered"] = "unanswered"
    yyyymm: str | None = Field(default=None, pattern=r"^\d{4}-?\d{2}$")


class Tenant(BaseModel):
    deposit: Money = Money()
    monthlyRent: Money = Money()
    leaseEnd: LeaseEnd = LeaseEnd()


class Answers(BaseModel):
    # 질문 1: 이 집을 어떻게 하고 싶나요? (빨리 정리 / 수익 창출 / 직접 사용 / 아직 모르겠음)
    purpose: Literal["quick_sale", "profit", "live", "undecided", "best_price", "rent"]
    # 질문 2: 현재 집 상태는 어떤가요?
    condition: Literal["good", "partial_repair", "major_repair", "unknown"]
    # 질문 3: 지금까지 처리를 미룬 가장 큰 이유는?
    delayReason: Literal["cost", "ownership", "redevelopment", "how_to", "other"] | None = None
    # 아래는 질문에서 묻지 않고 '계산 조건 수정'에서 선택 입력
    timing: Literal["within_3m", "within_6m", "within_12m", "flexible"] | None = None
    occupancy: Literal["owner", "tenant", "vacant", "unknown"] = "unknown"
    tenant: Tenant | None = None
    availableCash: Money = Money()
    loanBalance: Money = Money()
    loanRatePct: Rate = Rate()

    @model_validator(mode="after")
    def _defaults(self):
        if self.occupancy != "tenant":
            self.tenant = None
        if self.timing is None:  # '빨리 정리'는 6개월 안, 나머지는 시점 제한 없음
            self.timing = "within_6m" if self.purpose == "quick_sale" else "flexible"
        return self


class PriceRange(BaseModel):
    low: float = Field(ge=0, le=1e13)
    base: float = Field(ge=0, le=1e13)
    high: float = Field(ge=0, le=1e13)

    @model_validator(mode="after")
    def _ordered(self):
        if not self.low <= self.base <= self.high:
            raise ValueError("낮은 값 ≤ 기준값 ≤ 높은 값이어야 합니다.")
        return self


class MonthRange(PriceRange):
    low: float = Field(ge=0, le=120)
    base: float = Field(ge=0, le=120)
    high: float = Field(ge=0, le=120)


class Taxes(BaseModel):
    asIsSale: float | None = Field(default=None, ge=0)
    landSale: float | None = Field(default=None, ge=0)
    remodelSale: float | None = Field(default=None, ge=0)


class Overrides(BaseModel):
    """'계산 조건 수정' 값. 비어 있는 항목은 기본 가정값을 쓴다."""

    horizonMonths: int | None = Field(default=None, ge=6, le=240)
    discountRatePct: float | None = Field(default=None, ge=0, le=30)
    priceGrowthPct: float | None = Field(default=None, ge=-30, le=30)
    asIsPrice: PriceRange | None = None
    landPrice: PriceRange | None = None
    remodelPrice: PriceRange | None = None
    remodelRentMonthly: PriceRange | None = None
    demolitionCost: PriceRange | None = None
    remodelCost: PriceRange | None = None
    remodelScope: Literal["partial", "full"] | None = None
    replacementHousingMonthly: float | None = Field(default=None, ge=0)
    holdingCostMonthly: float | None = Field(default=None, ge=0)
    maintenanceAsIsMonthly: float | None = Field(default=None, ge=0)
    remodelVacancyPct: float | None = Field(default=None, ge=0, le=100)
    remodelMaintenanceMonthly: float | None = Field(default=None, ge=0)
    transactionExtraFixed: float | None = Field(default=None, ge=0)
    taxes: Taxes | None = None
    demolitionWorkMonths: MonthRange | None = None
    remodelWorkMonths: MonthRange | None = None
    saleLeadAsIs: MonthRange | None = None
    saleLeadLand: MonthRange | None = None
    saleLeadRemodeled: MonthRange | None = None


class Target(BaseModel):
    buildingPk: str | None = None


class PropertyRequest(BaseModel):
    mode: Mode
    address: dict


class CreateAnalysis(BaseModel):
    lookupId: str
    answers: Answers
    target: Target = Target()


class UpdateAnalysis(BaseModel):
    overrides: Overrides = Overrides()
    answers: Answers | None = None


class ConsultationRequest(BaseModel):
    analysisId: str
    optionId: Literal["sell_as_is", "demolish_sell_land", "remodel", "keep"]
    partnerId: str
    sharedFields: list[Literal["name", "phone", "address", "summary", "property"]]
    contactName: str = Field(min_length=1, max_length=50)
    contactPhone: str = Field(min_length=9, max_length=20)
    message: str | None = Field(default=None, max_length=1000)
    consent: bool
