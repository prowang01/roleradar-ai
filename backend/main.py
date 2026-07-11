from dotenv import load_dotenv

load_dotenv()  # Must run before any backend imports that read os.getenv at module level

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from backend.database import engine, Base
from backend.routers import jobs, analysis, profile


def _run_migrations() -> None:
    with engine.connect() as conn:
        cols = {row[1] for row in conn.execute(text("PRAGMA table_info(user_profiles)"))}
        if "resume_text" not in cols:
            conn.execute(text("ALTER TABLE user_profiles ADD COLUMN resume_text TEXT"))
            conn.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _run_migrations()
    yield


app = FastAPI(
    title="RoleRadar AI",
    description="AI-assisted job tracker and role-fit analyzer.",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow requests from the Chrome extension and a future local dashboard.
# local dev only — tighten allow_origins before any deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type"],
)

app.include_router(jobs.router)
app.include_router(analysis.router)
app.include_router(profile.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.1.0"}
