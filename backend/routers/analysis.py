from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import Job, FitAnalysis, UserProfile, Verdict
from backend.schemas import FitAnalysisResponse, JobBriefResponse
from backend.services.analyzer import get_analyzer
from backend.services.briefer import BriefService

router = APIRouter(prefix="/jobs", tags=["analysis"])


@router.post("/{job_id}/analyze", response_model=FitAnalysisResponse, status_code=201)
def analyze_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    profile = db.query(UserProfile).first()
    profile_data = None
    if profile:
        profile_data = {
            "target_roles": profile.target_roles or [],
            "career_goals": profile.career_goals,
            "current_experience_summary": profile.current_experience_summary,
            "minimum_salary_eur": profile.minimum_salary_eur,
            "happy_salary_eur": profile.happy_salary_eur,
            "preferred_stacks": profile.preferred_stacks or [],
            "target_keywords": profile.target_keywords or [],
            "avoid_keywords": profile.avoid_keywords or [],
            "red_flags": profile.red_flags or [],
            "strategy": profile.strategy,
            "resume_text": profile.resume_text,
        }

    job_data = {
        "title": job.title,
        "company": job.company,
        "location": job.location,
        "url": job.url,
        "description": job.description,
        "notes": job.notes,
        "role_type": job.role_type,
        "salary_min": job.salary_min,
        "salary_max": job.salary_max,
        "job_brief": job.job_brief_json,
    }

    try:
        analyzer = get_analyzer()
        result = analyzer.analyze(job_data, profile_data)
    except ValueError as exc:
        # Missing config (e.g. OPENAI_API_KEY not set)
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Analysis failed: {exc}")

    analysis = FitAnalysis(
        job_id=job_id,
        verdict=Verdict(result.verdict),
        fit_score=result.fit_score,
        role_type=result.role_type,
        seniority_estimate=result.seniority_estimate,
        company_type=result.company_type,
        salary_signal=result.salary_signal,
        career_upside=result.career_upside,
        learning_upside=result.learning_upside,
        technical_depth=result.technical_depth,
        why=result.why,
        pros_json=result.pros,
        cons_json=result.cons,
        risks_json=result.risks,
        missing_skills_json=result.missing_skills,
        matching_strengths_json=result.matching_strengths,
        prep_topics_json=result.prep_topics,
        cv_keywords_to_highlight_json=result.cv_keywords_to_highlight,
        recommended_action=result.recommended_action,
    )
    db.add(analysis)
    job.analyzed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(analysis)
    return analysis


@router.post("/{job_id}/brief", response_model=JobBriefResponse)
def generate_brief(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    if not job.description:
        raise HTTPException(status_code=400, detail="Job has no description to generate a brief from.")

    try:
        brief = BriefService().generate(job.title, job.company, job.location, job.description)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Brief generation failed: {exc}")

    job.job_brief_json = brief
    db.commit()
    return brief
