import io
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session
from pypdf import PdfReader

from backend.database import get_db
from backend.models import UserProfile
from backend.schemas import UserProfileUpdate, UserProfileResponse

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("", response_model=UserProfileResponse)
def get_profile(db: Session = Depends(get_db)):
    profile = db.query(UserProfile).first()
    if not profile:
        profile = UserProfile(id=1)
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.put("", response_model=UserProfileResponse)
def update_profile(payload: UserProfileUpdate, db: Session = Depends(get_db)):
    profile = db.query(UserProfile).first()
    if not profile:
        profile = UserProfile(id=1)
        db.add(profile)

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(profile, key, value)

    db.commit()
    db.refresh(profile)
    return profile


@router.post("/resume", response_model=UserProfileResponse)
async def upload_resume(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    contents = await file.read()
    try:
        reader = PdfReader(io.BytesIO(contents))
        resume_text = "\n".join(page.extract_text() or "" for page in reader.pages)
    except Exception:
        raise HTTPException(status_code=422, detail="Could not parse PDF. Try a different file.")

    profile = db.query(UserProfile).first()
    if not profile:
        profile = UserProfile(id=1)
        db.add(profile)

    profile.resume_text = resume_text.strip() or None
    db.commit()
    db.refresh(profile)
    return profile
