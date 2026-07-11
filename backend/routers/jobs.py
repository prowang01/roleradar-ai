from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session, joinedload

from backend.database import get_db
from backend.models import Job, JobStatus
from backend.schemas import JobCreate, JobUpdate, JobResponse, JobDetailResponse, FitAnalysisResponse, JobLookupResponse
from backend.services.dedup import find_duplicate

router = APIRouter(prefix="/jobs", tags=["jobs"])


def _latest_analysis(job: Job) -> Optional[FitAnalysisResponse]:
    if not job.analyses:
        return None
    latest = max(job.analyses, key=lambda a: a.created_at)
    return FitAnalysisResponse.model_validate(latest)


@router.post("", response_model=JobResponse)
def create_job(payload: JobCreate, response: Response, db: Session = Depends(get_db)):
    existing = find_duplicate(db, payload.url, payload.title, payload.company)
    if existing:
        response.status_code = 200
        return existing

    job = Job(
        source=payload.source,
        external_job_id=payload.external_job_id,
        title=payload.title,
        company=payload.company,
        location=payload.location,
        url=payload.url.strip() if payload.url else None,
        description=payload.description,
        status=payload.status,
        saved_at=datetime.now(timezone.utc),
        notes=payload.notes,
        role_type=payload.role_type,
        salary_min=payload.salary_min,
        salary_max=payload.salary_max,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    response.status_code = 201
    return job


@router.get("", response_model=List[JobDetailResponse])
def list_jobs(
    status: Optional[JobStatus] = Query(default=None, description="Filter by status"),
    db: Session = Depends(get_db),
):
    q = db.query(Job).options(joinedload(Job.analyses))
    if status:
        q = q.filter(Job.status == status)
    jobs = q.order_by(Job.created_at.desc()).all()

    result = []
    for job in jobs:
        job_response = JobDetailResponse.model_validate(job)
        job_response.latest_analysis = _latest_analysis(job)
        result.append(job_response)
    return result


@router.get("/lookup", response_model=JobLookupResponse)
def lookup_job(url: str = Query(..., description="Exact job URL"), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.url == url.strip()).first()
    if not job:
        return JobLookupResponse(found=False)

    job_response = JobDetailResponse.model_validate(job)
    job_response.latest_analysis = _latest_analysis(job)
    return JobLookupResponse(found=True, job=job_response)


@router.get("/{job_id}", response_model=JobDetailResponse)
def get_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    result = JobDetailResponse.model_validate(job)
    result.latest_analysis = _latest_analysis(job)
    return result


@router.patch("/{job_id}", response_model=JobResponse)
def update_job(job_id: int, payload: JobUpdate, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(job, key, value)

    db.commit()
    db.refresh(job)
    return job


@router.delete("/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id).first()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    db.delete(job)
    db.commit()
