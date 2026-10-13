from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class MaterialFamily(str, Enum):
    spent_solvent = "spent_solvent"
    used_oil = "used_oil"
    waste_oil = "waste_oil"
    plastic = "plastic"
    metal = "metal"
    other = "other"


class Evidence(BaseModel):
    field: str
    quote: str
    source_name: str
    page: int | None = None


class MaterialProfile(BaseModel):
    description: str
    family: MaterialFamily
    material_names: list[str] = Field(default_factory=list)
    contaminants: list[str] = Field(default_factory=list)
    hazard_indicated: bool | None = None
    quantity_tonnes_per_month: float | None = Field(default=None, ge=0)
    origin_city: str | None = None
    origin_state: str | None = None
    moisture_pct: float | None = Field(default=None, ge=0, le=100)
    flash_point_c: float | None = None
    evidence: list[Evidence] = Field(default_factory=list)
    missing_facts: list[str] = Field(default_factory=list)
    confidence: float = Field(default=0, ge=0, le=1)
    source_mode: Literal["gemini", "manual"] = "gemini"


class Facility(BaseModel):
    id: str
    name: str
    state: str
    city_or_district: str
    address: str
    families: list[MaterialFamily]
    process: str | None = None
    capacity_value: float | None = None
    capacity_unit: str | None = None
    source_url: str
    source_title: str
    source_page: int
    source_as_of: str | None = None
    authorization_reference: str | None = None
    authorization_valid_until: str | None = None
    verification_status: Literal["current_document_required", "expired_on_source", "listed_not_verified"] = "listed_not_verified"
    latitude: float | None = None
    longitude: float | None = None


class EconomicsInput(BaseModel):
    quote_facility_id: str | None = None
    disposal_cost_inr_per_tonne: float | None = Field(default=None, ge=0)
    buyer_quote_inr_per_tonne: float | None = None
    transport_quote_inr_per_tonne: float | None = Field(default=None, ge=0)
    pretreatment_quote_inr_per_tonne: float | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def quote_has_facility(self):
        if self.buyer_quote_inr_per_tonne is not None and not self.quote_facility_id:
            raise ValueError("Select the facility that issued the buyer quote")
        return self


class EconomicsResult(BaseModel):
    annual_net_inr: float | None = None
    formula: str
    assumptions_complete: bool
    missing_inputs: list[str]


class MatchRequest(BaseModel):
    profile: MaterialProfile
    economics: EconomicsInput = Field(default_factory=EconomicsInput)
    max_results: int = Field(default=30, ge=1, le=100)


class Candidate(BaseModel):
    facility: Facility
    status: Literal["candidate_requires_verification", "rejected"]
    reasons: list[str]
    questions_for_buyer: list[str]
    economics: EconomicsResult
    rank: int | None = None


class MatchResponse(BaseModel):
    generated_at: datetime
    profile: MaterialProfile
    candidates: list[Candidate]
    catalog_count: int
    catalog_sources: list[dict]
    disclaimer: str = "Directory listing is not proof of current authorization, technical acceptance, available capacity, or price. Confirm with the facility and regulator before moving waste."

