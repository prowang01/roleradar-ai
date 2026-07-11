import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, Float, DateTime, ForeignKey, Enum, JSON
from sqlalchemy.orm import relationship
from backend.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class JobStatus(str, enum.Enum):
    saved = "saved"
    applied = "applied"
    rejected = "rejected"
    oa = "oa"
    interview = "interview"
    offer = "offer"
    archived = "archived"


class Verdict(str, enum.Enum):
    strong_apply    = "strong_apply"
    apply           = "apply"
    apply_as_stretch = "apply_as_stretch"
    apply_only_if   = "apply_only_if"
    maybe           = "maybe"
    skip            = "skip"
    hard_skip       = "hard_skip"


class Job(Base):
    __tablename__ = "jobs"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String, nullable=False, default="manual")
    external_job_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    company = Column(String, nullable=False)
    location = Column(String, nullable=True)
    url = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    status = Column(Enum(JobStatus), nullable=False, default=JobStatus.saved)
    saved_at = Column(DateTime(timezone=True), nullable=True)
    applied_at = Column(DateTime(timezone=True), nullable=True)
    analyzed_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)
    role_type = Column(String, nullable=True)
    salary_min = Column(Integer, nullable=True)
    salary_max = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=_now, onupdate=_now)

    analyses = relationship(
        "FitAnalysis",
        back_populates="job",
        cascade="all, delete-orphan",
        lazy="select",
    )


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True)
    target_roles = Column(JSON, nullable=False, default=list)
    target_contract = Column(String, nullable=True)
    preferred_locations = Column(JSON, nullable=False, default=list)
    minimum_salary_eur = Column(Integer, nullable=True)
    happy_salary_eur = Column(Integer, nullable=True)
    strategy = Column(Text, nullable=True)
    preferred_stacks = Column(JSON, nullable=False, default=list)
    target_keywords = Column(JSON, nullable=False, default=list)
    avoid_keywords = Column(JSON, nullable=False, default=list)
    current_experience_summary = Column(Text, nullable=True)
    career_goals = Column(Text, nullable=True)
    red_flags = Column(JSON, nullable=False, default=list)
    decision_style = Column(String, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True, default=_now, onupdate=_now)


class FitAnalysis(Base):
    __tablename__ = "fit_analyses"

    id = Column(Integer, primary_key=True, index=True)
    job_id = Column(Integer, ForeignKey("jobs.id", ondelete="CASCADE"), nullable=False)
    verdict = Column(Enum(Verdict), nullable=False)
    fit_score = Column(Float, nullable=False)
    role_type = Column(String, nullable=True)
    seniority_estimate = Column(String, nullable=True)
    company_type = Column(String, nullable=True)
    salary_signal = Column(String, nullable=False, default="unknown")
    career_upside = Column(String, nullable=True)
    learning_upside = Column(String, nullable=True)
    technical_depth = Column(String, nullable=True)
    why = Column(Text, nullable=True)
    pros_json = Column(JSON, nullable=False, default=list)
    cons_json = Column(JSON, nullable=False, default=list)
    risks_json = Column(JSON, nullable=False, default=list)
    missing_skills_json = Column(JSON, nullable=False, default=list)
    matching_strengths_json = Column(JSON, nullable=False, default=list)
    prep_topics_json = Column(JSON, nullable=False, default=list)
    cv_keywords_to_highlight_json = Column(JSON, nullable=False, default=list)
    recommended_action = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=_now)

    job = relationship("Job", back_populates="analyses")
