# RoleRadar AI

AI-assisted job tracker and role-fit analyzer for focused job seekers.

RoleRadar AI helps you track job listings, avoid duplicate applications, and get a strict AI opinion on whether a role actually fits your goals — without hype, without auto-applying, and without scraping LinkedIn at scale.

---

## Product vision

Most job-search tools optimize for volume. RoleRadar AI optimizes for signal.

The goal is a local decision assistant that tells you, honestly, which roles are worth your time — and which are not. It surfaces patterns (consulting traps, seniority mismatches, salary misalignment) and gives you structured prep guidance for the roles worth pursuing.

Current milestone: **Dashboard MVP** — Kanban pipeline view, job detail panel, status updates.

---

## Ethical boundaries

- RoleRadar AI does **not** auto-apply to jobs.
- It does **not** submit forms on your behalf.
- It does **not** scrape LinkedIn at scale.
- It is a **user-triggered** job tracker and decision assistant.
- All analysis is initiated manually per job, keeping API costs under control.

---

## Local setup

**Requirements:** Python 3.10+, Node.js 18+

```bash
# 1. Clone the repo
git clone <your-repo-url>
cd roleradar-ai

# 2. Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate      # macOS/Linux
# .venv\Scripts\activate       # Windows

# 3. Install Python dependencies
pip install -r requirements.txt

# 4. Install Node dependencies (root + dashboard)
npm install
npm --prefix apps/dashboard install

# 5. Configure environment
cp .env.example .env
# Edit .env if needed — defaults work out of the box with MockAnalyzer
```

The SQLite database (`roleradar.db`) is created automatically on first run.

---

## Running locally (one command)

> **Note:** Activate your Python venv first (`source .venv/bin/activate`).

```bash
npm run dev
```

This starts both services concurrently:

| Service | URL |
|---------|-----|
| FastAPI backend | http://localhost:8000 |
| React dashboard | http://localhost:5173 |
| Swagger UI | http://localhost:8000/docs |

To stop both, press `Ctrl+C`.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/jobs` | Add a job (deduplicates automatically) |
| GET | `/jobs` | List all jobs (optional `?status=` filter) |
| GET | `/jobs/{id}` | Get job + latest analysis |
| PATCH | `/jobs/{id}` | Update job fields or status |
| DELETE | `/jobs/{id}` | Delete a job |
| POST | `/jobs/{id}/analyze` | Run AI fit analysis |
| GET | `/profile` | Get user profile |
| PUT | `/profile` | Update user profile |

**Job statuses:** `saved` · `applied` · `rejected` · `oa` · `interview` · `offer` · `archived`

**Verdicts:** `strong_apply` · `apply` · `apply_only_if` · `maybe` · `skip` · `hard_skip`

---

## Testing with curl

### Health check

```bash
curl http://localhost:8000/health
```

### Set up your profile

```bash
curl -X PUT http://localhost:8000/profile \
  -H "Content-Type: application/json" \
  -d '{
    "target_roles": ["AI Engineer", "Backend Engineer", "Data Engineer"],
    "career_goals": "Join a high-growth AI-first company working on LLMs, RAG systems, or data pipelines.",
    "current_experience_summary": "3 years backend Python, 1 year ML tooling, some LLM experimentation.",
    "minimum_salary_eur": 70000,
    "happy_salary_eur": 90000,
    "preferred_stacks": ["Python", "FastAPI", "PostgreSQL", "RAG", "LangChain"],
    "target_keywords": ["founding", "AI", "LLM", "RAG", "agents", "data pipeline"],
    "avoid_keywords": ["consulting", "ESN", "support", "no-code"],
    "red_flags": ["no technical description", "vague about stack", "mandatory travel"],
    "strategy": "Target AI-first startups and scale-ups. Avoid ESN and support roles."
  }'
```

### Add a job

```bash
curl -X POST http://localhost:8000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "title": "AI Engineer",
    "company": "Mistral AI",
    "location": "Paris, France",
    "url": "https://jobs.mistral.ai/ai-engineer-2024",
    "description": "Join our founding team to build RAG pipelines and LLM agent systems. You will work on inference optimization, fine-tuning workflows, and embedding search at scale. Strong Python and backend experience required."
  }'
```

A duplicate URL returns the existing job (HTTP 200) instead of creating a new one.

### Run analysis

```bash
curl -X POST http://localhost:8000/jobs/1/analyze
```

### Get job with latest analysis

```bash
curl http://localhost:8000/jobs/1
```

### List jobs filtered by status

```bash
curl "http://localhost:8000/jobs?status=saved"
```

### Update job status

```bash
curl -X PATCH http://localhost:8000/jobs/1 \
  -H "Content-Type: application/json" \
  -d '{"status": "applied"}'
```

### Delete a job

```bash
curl -X DELETE http://localhost:8000/jobs/1
```

---

## AI provider setup

### Default: MockAnalyzer (no API key required)

Works out of the box. Performs keyword-based scoring to demonstrate the system. All mock results are clearly labelled.

Set in `.env`:
```
AI_PROVIDER=mock
```

### Optional: OpenAI (gpt-4o-mini)

For real structured analysis. Costs approximately €0.0003 per job — well within a €1 testing budget.

```
AI_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

If `AI_PROVIDER=openai` but `OPENAI_API_KEY` is missing, the `/analyze` endpoint returns HTTP 400 with a clear error message.

**Important:** Analysis is always user-triggered (`POST /jobs/{id}/analyze`). It never runs automatically, keeping usage and cost fully under your control.

---

## Project structure

```
roleradar-ai/
├── backend/
│   ├── main.py               # FastAPI app + DB init on startup
│   ├── database.py           # SQLAlchemy engine, session, Base
│   ├── models.py             # ORM: Job, UserProfile, FitAnalysis
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── routers/
│   │   ├── jobs.py           # CRUD + deduplication
│   │   ├── analysis.py       # AI fit analysis endpoint
│   │   └── profile.py        # User profile upsert
│   └── services/
│       ├── dedup.py          # URL + title/company fingerprinting
│       └── analyzer.py       # MockAnalyzer, OpenAIAnalyzer, get_analyzer()
├── apps/
│   └── dashboard/            # React + Vite local dashboard
│       ├── src/
│       │   ├── App.tsx
│       │   ├── api.ts
│       │   ├── types.ts
│       │   ├── styles.css
│       │   └── components/
│       │       ├── Board.tsx
│       │       ├── Column.tsx
│       │       ├── JobCard.tsx
│       │       ├── DetailPanel.tsx
│       │       └── StatsRow.tsx
│       └── package.json
├── extension/                # Chrome extension (MV3)
├── package.json              # Root: npm run dev starts both services
├── requirements.txt
├── .env.example
└── README.md
```

---

## Next milestone

**Milestone 2 — Chrome Extension (ingestion layer)**

- One-click "Save job" from a LinkedIn job page
- Auto-fills title, company, location, URL, and description
- Posts to `POST /jobs` on the local backend
- No scraping, no automation — purely passive capture while browsing
