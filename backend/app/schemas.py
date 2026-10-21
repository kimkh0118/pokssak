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
    purpose: Literal["quick_sale", "best_price", "live", "rent", "undecided"]
    timing: Literal["within_3m", "within_6m", "within_12m", "flexible"]
    occupancy: Literal["owner", "tenant", "vacant", "unknown"]
    condition: Literal["good", "partial_repair", "major_repair", "unknown"]
    tenant: Tenant | None = None
    availableCash: Money = Money()
    loanBalance: Money = Money()
    loanRatePct: Rate = Rate()

    @model_validator(mode="after")
    def _tenant_only_when_tenant(self):
        if self.occupancy != "tenant":
            self.tenant = None
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
    scopeConfirmedByUser: bool = False


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
