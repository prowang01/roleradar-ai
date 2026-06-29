from dotenv import load_dotenv

load_dotenv()  # Must run before any backend imports that read os.getenv at module level

from contextlib import asynccontextmanager
from fastapi import FastAPI
from backend.database import engine, Base
from backend.routers import jobs, analysis, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(
    title="RoleRadar AI",
    description="AI-assisted job tracker and role-fit analyzer.",
    version="0.1.0",
    lifespan=lifespan,
)

app.include_router(jobs.router)
app.include_router(analysis.router)
app.include_router(profile.router)


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok", "version": "0.1.0"}
