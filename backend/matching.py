from __future__ import annotations

import re
from datetime import datetime, timezone

from .models import Candidate, EconomicsInput, EconomicsResult, Facility, MatchRequest, MatchResponse


def _named_material(text: str, family: str) -> str | None:
    names = ("PET", "HDPE", "LDPE", "PVC", "PP") if family == "plastic" else ("aluminium", "copper", "brass") if family == "metal" else ()
    for name in names:
        if re.search(rf"(?<![A-Za-z]){re.escape(name)}(?![A-Za-z])", text, re.I):
            return name.upper()
    return None


def calculate_economics(quantity_tonnes_per_month: float | None, values: EconomicsInput) -> EconomicsResult:
    required = {
        "quantity_tonnes_per_month": quantity_tonnes_per_month,
        "disposal_cost_inr_per_tonne": values.disposal_cost_inr_per_tonne,
        "buyer_quote_inr_per_tonne": values.buyer_quote_inr_per_tonne,
        "transport_quote_inr_per_tonne": values.transport_quote_inr_per_tonne,
    }
    missing = [name for name, value in required.items() if value is None]
    formula = "12 × tonnes/month × (avoided disposal cost + buyer quote − transport quote − pretreatment quote)"
    if missing:
        return EconomicsResult(formula=formula, assumptions_complete=False, missing_inputs=missing)
    annual = 12 * quantity_tonnes_per_month * (
        values.disposal_cost_inr_per_tonne
        + values.buyer_quote_inr_per_tonne
        - values.transport_quote_inr_per_tonne
        - (values.pretreatment_quote_inr_per_tonne or 0)
    )
    return EconomicsResult(annual_net_inr=round(annual, 2), formula=formula, assumptions_complete=True, missing_inputs=[])


def match(request: MatchRequest, facilities: list[Facility], sources: list[dict]) -> MatchResponse:
    profile = request.profile
    results = []
    for facility in facilities:
        if profile.family not in facility.families:
            continue
        economics = calculate_economics(
            profile.quantity_tonnes_per_month,
            request.economics if facility.id == request.economics.quote_facility_id else EconomicsInput(),
        )
        stream_specific = _named_material(" ".join([profile.description, *profile.material_names]), profile.family.value)
        facility_specific = _named_material(facility.process or "", profile.family.value)
        if stream_specific and facility_specific and stream_specific != facility_specific:
            results.append(Candidate(
                facility=facility, status="rejected",
                reasons=[f"Directory process specifies {facility_specific}, while the supplied stream specifies {stream_specific}."],
                questions_for_buyer=["Ask whether a current authorization and technical specification cover the supplied material."],
                economics=economics,
            ))
            continue
        restricted_flash_point = bool(facility.process and "above 93°C" in facility.process)
        if restricted_flash_point and profile.flash_point_c is not None and profile.flash_point_c <= 93:
            results.append(Candidate(
                facility=facility,
                status="rejected",
                reasons=[f"Directory limits this process to solvent above 93°C flash point; supplied stream is {profile.flash_point_c:g}°C."],
                questions_for_buyer=["Verify the flash-point restriction and measured result against the current authorization."],
                economics=economics,
            ))
            continue
        reasons = [f"Official directory lists this facility for {profile.family.value.replace('_', ' ')}."]
        if restricted_flash_point:
            reasons.append("This entry requires flash point above 93°C; verify a measured flash point before contacting.")
        if facility.verification_status == "expired_on_source":
            reasons.append("The authorization date shown in this source has passed; obtain a current authorization document.")
        else:
            reasons.append("Current authorization, accepted composition, available capacity, and commercial terms require confirmation.")
        if profile.contaminants:
            reasons.append("Listed contaminants need a facility-specific acceptance check: " + ", ".join(profile.contaminants) + ".")
        questions = [
            "Send a current authorization covering this waste category and process.",
            "Confirm the accepted composition, contaminant limits, and required analysis report.",
            "Confirm available monthly capacity, handling format, and price in writing.",
        ]
        if facility.capacity_unit and "KL" in facility.capacity_unit.upper():
            questions.append("Provide density before comparing a volume capacity with tonnes per month.")
        results.append(Candidate(
            facility=facility,
            status="candidate_requires_verification",
            reasons=reasons,
            questions_for_buyer=questions,
            economics=economics,
        ))
    results.sort(key=lambda x: (
        0 if x.status != "rejected" else 1,
        0 if x.facility.state.lower() == (profile.origin_state or "").lower() else 1,
        0 if x.facility.city_or_district.lower() == (profile.origin_city or "").lower() else 1,
        x.facility.name.lower(),
    ))
    viable = [item for item in results if item.status != "rejected"]
    rejected = [item for item in results if item.status == "rejected"]
    keep_rejections = min(5, len(rejected), request.max_results // 3)
    chosen = viable[: request.max_results - keep_rejections] + rejected[:keep_rejections]
    if len(chosen) < request.max_results:
        chosen.extend(rejected[keep_rejections: request.max_results - len(chosen) + keep_rejections])
    for index, candidate in enumerate(chosen, start=1):
        candidate.rank = index
    return MatchResponse(
        generated_at=datetime.now(timezone.utc),
        profile=profile,
        candidates=chosen,
        catalog_count=len(facilities),
        catalog_sources=sources,
    )
