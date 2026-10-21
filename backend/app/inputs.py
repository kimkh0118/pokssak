"""조회 결과 + 질문 답 + '계산 조건 수정' 값 → 계산 입력(EngineInput).

화면에 보여줄 기본 정보(facts)와 가정·출처 목록(assumptions)도 함께 만든다.
각 값에는 출처 구분(provenance)을 붙인다: public_api(공공데이터) / user_input(사용자 입력) / estimate(추정) / sample(예시).
"""

from __future__ import annotations

from datetime import date

from . import estimates, sample_data
from .analysis import EngineInput
from .calculator import BROKERAGE_RULE_SOURCE
from .labels import area, won
from .schemas import Answers, Overrides, Target


def months_until(yyyymm: str, today: date | None = None) -> int | None:
    today = today or date.today()
    digits = yyyymm.replace("-", "")
    if len(digits) != 6 or not digits.isdigit():
        return None
    diff = (int(digits[:4]) - today.year) * 12 + (int(digits[4:]) - today.month)
    return max(0, diff)


def pick_building(lookup: dict, target: Target) -> dict | None:
    main = lookup["mainBuildings"]
    if not main:
        return None
    if target.buildingPk == "all":
        oldest = min(main, key=lambda b: b.get("useAprDay") or "9")
        return {**main[0], "totArea": sum(b.get("totArea") or 0 for b in main),
                "dongNm": "전체 주건축물 합계", "useAprDay": oldest.get("useAprDay")}
    return next((b for b in main if b.get("mgmBldrgstPk") == target.buildingPk), main[0])


def _range_text(r: dict | None) -> str:
    return f"{won(r['base'])} (범위 {won(r['low'])} ~ {won(r['high'])})" if r else "산정 보류"


def _months_text(r: dict) -> str:
    return f"{r['base']:g}개월 ({r['low']:g}~{r['high']:g}개월)"


def build(lookup: dict, answers: Answers, target: Target, ov: Overrides) -> dict:
    sample = lookup["mode"] == "sample"
    data_prov = "sample" if sample else "public_api"
    est_prov = "sample" if sample else "estimate"
    land = lookup["land"]["data"] if lookup["land"]["ok"] else None
    land_meta = lookup["land"]["meta"] if lookup["land"]["ok"] else {}
    building = pick_building(lookup, target)
    bmeta = lookup["buildings"]["meta"] if lookup["buildings"]["ok"] else {}

    land_area = (land or {}).get("lndpclAr") or (building or {}).get("platArea")
    floor_area = (building or {}).get("totArea")
    build_year = int(building["useAprDay"][:4]) if building and building.get("useAprDay") else None

    # ---- 기본 정보
    facts = []

    def fact(key, label, value, prov, source, **extra):
        facts.append({"key": key, "label": label, "value": value, "provenance": prov, "source": source, **extra})

    a = lookup["address"]
    addr_src = "예시 데이터" if sample else "도로명주소 검색 API"
    fact("roadAddr", "도로명주소", a["roadAddr"], a["provenance"], addr_src)
    fact("jibunAddr", "지번주소", a["jibunAddr"], a["provenance"], addr_src)
    fact("admCd", "법정동코드", a["admCd"], a["provenance"], addr_src)
    fact("pnu", "필지고유번호(PNU)", (lookup["parcel"] or {}).get("pnu"), "estimate",
         "법정동코드+대지구분+본번+부번으로 조합", note="조합 규칙으로 만든 식별자")
    if land:
        when = {"asOf": land_meta.get("asOf"), "fetchedAt": land_meta.get("fetchedAt")}
        zoning = ", ".join(x for x in (land.get("prposArea1Nm"), land.get("prposArea2Nm")) if x and x != "지정되지않음") or None
        fact("lndpclAr", "토지 면적", land.get("lndpclAr"), data_prov, land_meta["source"], unit="㎡", **when)
        fact("lndcgr", "지목", land.get("lndcgrCodeNm"), data_prov, land_meta["source"], **when)
        fact("prposArea", "용도지역", zoning, data_prov, land_meta["source"], **when)
        fact("pblntfPclnd", f"공시지가({land.get('stdrYear') or '기준연도 미상'}년)", land.get("pblntfPclnd"), data_prov,
             land_meta["source"], unit="원/㎡", note="공시지가는 시장 매각가가 아니므로 매각가 계산에 쓰지 않습니다.", **when)
    if building:
        when = {"asOf": bmeta.get("asOf"), "fetchedAt": bmeta.get("fetchedAt")}
        floors = None
        if building.get("grndFlrCnt") is not None:
            floors = f"지상 {building['grndFlrCnt']:g}층" + (f" / 지하 {building['ugrndFlrCnt']:g}층" if building.get("ugrndFlrCnt") else "")
        fact("mainPurps", "건축물 용도", building.get("mainPurpsCdNm"), data_prov, bmeta["source"], **when)
        fact("strct", "구조", building.get("strctCdNm"), data_prov, bmeta["source"], **when)
        fact("totArea", "연면적", building.get("totArea"), data_prov, bmeta["source"], unit="㎡", **when)
        fact("flr", "층수", floors, data_prov, bmeta["source"], **when)
        fact("useAprDay", "사용승인일", building.get("useAprDay"), data_prov, bmeta["source"], **when)

    # ---- 가격·비용 추정
    subject = {"landArea": land_area, "floorArea": floor_area, "buildYear": build_year, "umdNm": a.get("emdNm") or None}
    trades = lookup["trades"]
    comps = estimates.estimate_from_trades(subject, trades["data"] if trades["ok"] else [])
    if not trades["ok"]:
        comps["withheldReason"] = f"거래 사례 조회 실패: {trades['error']['message']}"
    land_trades = lookup.get("landTrades")
    land_comps = estimates.estimate_land_price(subject, land_trades["data"] if land_trades and land_trades["ok"] else None)

    scope = ov.remodelScope or ("full" if answers.condition == "major_repair" else "partial")
    demolition = estimates.estimate_demolition(floor_area)
    remodel = estimates.estimate_remodel(floor_area, scope)
    sample_assumption = sample_data.REMODEL_ASSUMPTIONS.get(a["id"]) if sample else None

    def chosen(user_value, default):
        """(값, 사용자 입력 여부)"""
        return (user_value.model_dump(), True) if user_value is not None else (default, False)

    as_is_price, as_is_user = chosen(ov.asIsPrice, comps["range"])
    land_price, land_user = chosen(ov.landPrice, land_comps["range"])
    remodel_price, remodel_user = chosen(ov.remodelPrice, sample_assumption and sample_assumption["price"])
    remodel_rent, rent_user = chosen(ov.remodelRentMonthly, sample_assumption and sample_assumption["rent"])
    demolition_cost, demo_user = chosen(ov.demolitionCost, demolition["total"])
    remodel_cost, rem_user = chosen(ov.remodelCost, remodel["total"])

    # ---- 질문 답
    t = answers.tenant
    tenant_deposit = t.deposit.value if t else None
    tenant_rent = t.monthlyRent.value if t else None
    lease_end = months_until(t.leaseEnd.yyyymm) if t and t.leaseEnd.status == "known" and t.leaseEnd.yyyymm else None
    loan = answers.loanBalance.value
    loan_rate = answers.loanRatePct.pct / 100 if answers.loanRatePct.status == "known" and answers.loanRatePct.pct is not None \
        else (0 if loan == 0 else None)
    cash = answers.availableCash.value

    def pick(value, default):
        return default if value is None else value

    durations = {
        "demolition_prep": {"low": 1, "base": 2, "high": 4},
        "demolition_work": ov.demolitionWorkMonths.model_dump() if ov.demolitionWorkMonths else {"low": 1, "base": 1, "high": 2},
        "remodel_prep": {"low": 1, "base": 2, "high": 3},
        "remodel_work": ov.remodelWorkMonths.model_dump() if ov.remodelWorkMonths else
        ({"low": 3, "base": 5, "high": 7} if scope == "full" else {"low": 2, "base": 3, "high": 4}),
        "lead_as_is": ov.saleLeadAsIs.model_dump() if ov.saleLeadAsIs else {"low": 2, "base": 4, "high": 7},
        "lead_land": ov.saleLeadLand.model_dump() if ov.saleLeadLand else {"low": 3, "base": 5, "high": 9},
        "lead_remodeled": ov.saleLeadRemodeled.model_dump() if ov.saleLeadRemodeled else {"low": 2, "base": 4, "high": 7},
    }
    taxes = ov.taxes or None

    engine = EngineInput(
        purpose=answers.purpose, timing=answers.timing, occupancy=answers.occupancy, condition=answers.condition,
        delay_reason=answers.delayReason,
        horizon_months=pick(ov.horizonMonths, 36),
        discount_rate=pick(ov.discountRatePct, 3.5) / 100,
        price_growth=pick(ov.priceGrowthPct, 0) / 100,
        available_cash=cash, loan_balance=loan, loan_rate=loan_rate,
        tenant_deposit=tenant_deposit, tenant_rent=tenant_rent, lease_end_month=lease_end,
        replacement_housing=ov.replacementHousingMonthly,
        holding_cost=pick(ov.holdingCostMonthly, 100_000),
        maintenance_as_is=pick(ov.maintenanceAsIsMonthly, estimates.MAINTENANCE_BY_CONDITION[answers.condition]),
        as_is_price=as_is_price, land_price=land_price, remodel_price=remodel_price, remodel_rent=remodel_rent,
        remodel_vacancy=pick(ov.remodelVacancyPct, 5) / 100,
        remodel_maintenance=pick(ov.remodelMaintenanceMonthly, 100_000),
        demolition_cost=demolition_cost, remodel_cost=remodel_cost,
        transaction_extra=pick(ov.transactionExtraFixed, 0),
        tax_as_is=taxes.asIsSale if taxes else None,
        tax_land=taxes.landSale if taxes else None,
        tax_remodel=taxes.remodelSale if taxes else None,
        **durations,
    )

    # ---- 가정·출처 목록(화면 표시용)
    rows = []

    def add(key, group, label, display, provenance, source, **extra):
        rows.append({"key": key, "group": group, "label": label, "display": display,
                     "provenance": provenance, "source": source, **extra})

    def user_or(user: bool, default: str) -> str:
        return "user_input" if user else default

    def missing_text(status: str) -> str:
        return "모름" if status == "unknown" else "미입력"

    add("landArea", "기본 정보", "분석에 쓴 토지 면적", area(land_area), data_prov if land_area else "estimate",
        land_meta.get("source") if land and land.get("lndpclAr") else (f"{bmeta.get('source')} 대지면적" if land_area else "정보 없음"))
    add("floorArea", "기본 정보", "분석에 쓴 연면적", area(floor_area), data_prov if floor_area else "estimate",
        bmeta.get("source") or "정보 없음", note=(building or {}).get("dongNm"))
    add("asIsPrice", "가격", "현상태 매각가", _range_text(as_is_price), user_or(as_is_user, est_prov),
        "계산 조건 수정에서 직접 입력" if as_is_user else
        (f"유사 거래 {comps['sampleSize']}건({'같은 법정동' if comps['basis'] == 'same_dong' else '시군구 전체'}) 대지㎡당 가격 분위수"
         if comps["range"] else comps["withheldReason"]),
        asOf=trades["meta"].get("asOf") if trades["ok"] else None,
        fetchedAt=trades["meta"].get("fetchedAt") if trades["ok"] else None)
    add("landPrice", "가격", "철거 후 토지 매각가", _range_text(land_price), user_or(land_user, est_prov),
        "계산 조건 수정에서 직접 입력(전문가 의견 등)" if land_user else
        (f"토지 거래 {land_comps['sampleSize']}건 ㎡당 가격 분위수" if land_comps["range"] else land_comps["withheldReason"]),
        note="기존 주택 가격에 상승률을 곱해 만들지 않습니다.")
    add("remodelPrice", "가격", "리모델링 후 가치", _range_text(remodel_price),
        "user_input" if remodel_user else ("sample" if sample_assumption else "estimate"),
        "계산 조건 수정에서 직접 입력" if remodel_user else ("예시 가정값" if sample_assumption else "근거 없음 — 직접 입력 필요"),
        note="공사비만큼 집값이 오른다고 가정하지 않습니다.")
    add("remodelRent", "가격", "리모델링 후 월 임대료", _range_text(remodel_rent),
        "user_input" if rent_user else ("sample" if sample_assumption else "estimate"),
        "계산 조건 수정에서 직접 입력" if rent_user else ("예시 가정값" if sample_assumption else "근거 없음 — 직접 입력 필요"))
    add("demolitionCost", "비용", "철거 실행비용 합계", _range_text(demolition_cost), user_or(demo_user, est_prov),
        "견적 등 직접 입력" if demo_user else (estimates.COST_SOURCE if demolition["total"] else demolition["withheldReason"]),
        asOf=None if demo_user else estimates.COST_AS_OF)
    add("remodelCost", "비용", f"리모델링 실행비용 합계({'전면' if scope == 'full' else '부분'})", _range_text(remodel_cost),
        user_or(rem_user, est_prov),
        "견적 등 직접 입력" if rem_user else (estimates.COST_SOURCE if remodel["total"] else remodel["withheldReason"]),
        asOf=None if rem_user else estimates.COST_AS_OF)
    add("transaction", "비용", "중개·거래비용", f"중개보수 상한 + 기타 {won(engine.transaction_extra)}", "estimate", BROKERAGE_RULE_SOURCE)
    add("holding", "비용", "월 보유비(보유세 제외)", won(engine.holding_cost),
        "user_input" if ov.holdingCostMonthly is not None else "estimate", "서비스 기본 가정값")
    add("maintenance", "비용", "현 건물 월 유지관리비", won(engine.maintenance_as_is),
        "user_input" if ov.maintenanceAsIsMonthly is not None else "estimate", "집 상태 답변에 따른 기본 가정값(전문 진단 아님)")
    no_tax = all(x is None for x in (engine.tax_as_is, engine.tax_land, engine.tax_remodel))
    add("taxes", "비용", "세금", "세금 반영 전" if no_tax else
        f"현상태 {won(engine.tax_as_is)} / 토지 {won(engine.tax_land)} / 리모델링 후 {won(engine.tax_remodel)}",
        "user_input" if taxes else "estimate", "개인별 세금은 검증된 계산 규칙이 없어 자동 산정하지 않음(직접 입력 시 반영)")
    add("replacement", "자금·임대차", "월 대체·임시 주거비", "미입력" if engine.replacement_housing is None else won(engine.replacement_housing),
        "estimate" if engine.replacement_housing is None else "user_input",
        "본인 거주 시 필요(계산 조건 수정에서 입력)" if answers.occupancy == "owner" else "본인 거주가 아니면 사용하지 않음")
    add("loan", "자금·임대차", "대출 잔액 / 금리",
        f"{missing_text(answers.loanBalance.status) if loan is None else won(loan)} / "
        f"{missing_text(answers.loanRatePct.status) if loan_rate is None else f'{loan_rate * 100:.2f}%'}",
        "estimate" if loan is None else "user_input", "계산 조건 수정의 자금·대출 입력(미입력 시 대출 반영 전으로 표시)")
    add("cash", "자금·임대차", "추가 투입 가능 현금", missing_text(answers.availableCash.status) if cash is None else won(cash),
        "estimate" if cash is None else "user_input", "계산 조건 수정의 자금·대출 입력(미입력 시 예산 판단 보류)")
    if answers.occupancy == "tenant":
        add("tenant", "자금·임대차", "임차보증금 / 월세 / 종료",
            f"{'모름' if tenant_deposit is None else won(tenant_deposit)} / {'모름' if tenant_rent is None else won(tenant_rent)} / "
            f"{'모름' if lease_end is None else f'{lease_end}개월 후'}", "user_input", "계산 조건 수정 입력")
    add("durations", "기간", "매각 소요(현상태/토지/리모델링 후)",
        f"{_months_text(durations['lead_as_is'])} / {_months_text(durations['lead_land'])} / {_months_text(durations['lead_remodeled'])}",
        "estimate", "서비스 기본 가정값")
    add("works", "기간", "공사 기간(철거/리모델링)",
        f"준비 {_months_text(durations['demolition_prep'])} + 공사 {_months_text(durations['demolition_work'])} / "
        f"준비 {_months_text(durations['remodel_prep'])} + 공사 {_months_text(durations['remodel_work'])}",
        "estimate", "서비스 기본 가정값(인허가 일정에 따라 달라짐)")
    add("horizon", "비교 기준", "공통 비교 기간 H", f"{engine.horizon_months}개월",
        "user_input" if ov.horizonMonths is not None else "estimate", "기본 가정(수정 가능)")
    add("discount", "비교 기준", "연 할인율 r", f"{engine.discount_rate * 100:.1f}%",
        "user_input" if ov.discountRatePct is not None else "estimate", "기본 가정(수정 가능)")
    add("growth", "비교 기준", "연 가격변동률", f"{engine.price_growth * 100:.1f}%",
        "user_input" if ov.priceGrowthPct is not None else "estimate", "기본 가정(수정 가능, 모든 선택지에 동일 적용)")

    # 계산 조건 수정 화면이 '현재 값'으로 보여줄 요약
    current = {
        "horizonMonths": engine.horizon_months,
        "discountRatePct": engine.discount_rate * 100,
        "priceGrowthPct": engine.price_growth * 100,
        "replacementHousingMonthly": engine.replacement_housing,
        "holdingCostMonthly": engine.holding_cost,
        "asIsPrice": as_is_price, "landPrice": land_price, "remodelPrice": remodel_price,
        "remodelRentMonthly": remodel_rent, "demolitionCost": demolition_cost, "remodelCost": remodel_cost,
    }

    return {
        "engine": engine,
        "current": current,
        "facts": facts,
        "assumptions": rows,
        "comps": comps,
        "landComps": land_comps,
        "costs": {"demolition": demolition, "remodel": remodel},
        "subject": {**subject, "building": building},
    }
