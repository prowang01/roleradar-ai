import re
from typing import Optional
from sqlalchemy.orm import Session
from backend.models import Job


def _normalize(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", s.lower())


def find_duplicate(db: Session, url: Optional[str], title: str, company: str) -> Optional[Job]:
    if url and url.strip():
        match = db.query(Job).filter(Job.url == url.strip()).first()
        if match:
            return match

    # Full table scan — acceptable for MVP scale
    norm_title = _normalize(title)
    norm_company = _normalize(company)
    for job in db.query(Job).all():
        if _normalize(job.title) == norm_title and _normalize(job.company) == norm_company:
            return job

    return None
