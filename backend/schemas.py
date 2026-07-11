from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, ConfigDict
from backend.models import JobStatus, Verdict


class JobCreate(BaseModel):
    source: str = "manual"
    external_job_id: Optional[str] = None
    title: str
    company: str
    location: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    status: JobStatus = JobStatus.saved
    notes: Optional[str] = None
    role_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None


class JobUpdate(BaseModel):
    title: Optional[str] = None
    company: Optional[str] = None
    location: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    status: Optional[JobStatus] = None
    notes: Optional[str] = None
    role_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    applied_at: Optional[datetime] = None


class FitAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    job_id: int
    verdict: Verdict
    fit_score: float
    role_type: Optional[str] = None
    seniority_estimate: Optional[str] = None
    company_type: Optional[str] = None
    salary_signal: str = "unknown"
    career_upside: Optional[str] = None
    learning_upside: Optional[str] = None
    technical_depth: Optional[str] = None
    why: Optional[str] = None
    pros_json: List[str] = []
    cons_json: List[str] = []
    risks_json: List[str] = []
    missing_skills_json: List[str] = []
    matching_strengths_json: List[str] = []
    prep_topics_json: List[str] = []
    cv_keywords_to_highlight_json: List[str] = []
    recommended_action: Optional[str] = None
    created_at: datetime


class JobResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    source: str
    external_job_id: Optional[str] = None
    title: str
    company: str
    location: Optional[str] = None
    url: Optional[str] = None
    description: Optional[str] = None
    status: JobStatus
    saved_at: Optional[datetime] = None
    applied_at: Optional[datetime] = None
    analyzed_at: Optional[datetime] = None
    notes: Optional[str] = None
    role_type: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    created_at: datetime
    updated_at: datetime


class JobDetailResponse(JobResponse):
    latest_analysis: Optional[FitAnalysisResponse] = None


class JobLookupResponse(BaseModel):
    found: bool
    job: Optional[JobDetailResponse] = None


class UserProfileUpdate(BaseModel):
    target_roles: Optional[List[str]] = None
    target_contract: Optional[str] = None
    preferred_locations: Optional[List[str]] = None
    minimum_salary_eur: Optional[int] = None
    happy_salary_eur: Optional[int] = None
    strategy: Optional[str] = None
    preferred_stacks: Optional[List[str]] = None
    target_keywords: Optional[List[str]] = None
    avoid_keywords: Optional[List[str]] = None
    current_experience_summary: Optional[str] = None
    career_goals: Optional[str] = None
    red_flags: Optional[List[str]] = None
    decision_style: Optional[str] = None
    resume_text: Optional[str] = None


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    target_roles: List[str] = []
    target_contract: Optional[str] = None
    preferred_locations: List[str] = []
    minimum_salary_eur: Optional[int] = None
    happy_salary_eur: Optional[int] = None
    strategy: Optional[str] = None
    preferred_stacks: List[str] = []
    target_keywords: List[str] = []
    avoid_keywords: List[str] = []
    current_experience_summary: Optional[str] = None
    career_goals: Optional[str] = None
    red_flags: List[str] = []
    decision_style: Optional[str] = None
    resume_text: Optional[str] = None
    updated_at: Optional[datetime] = None
