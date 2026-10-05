# Cleanup and verification record

Reviewed on **4 October 2026**, from clean baseline commit `fdb9b37`. This is a bounded portfolio cleanup, not a new product release. Read [architecture.md](architecture.md), [ai-design.md](ai-design.md), and [interview-guide.md](interview-guide.md) for technical detail and history.

## Inspection scope

Reviewed all tracked application sources/configuration, both npm manifests and lockfiles, Python requirements, environment/ignore files, README, git log and relevant extraction/AI/profile/cleanup diffs. All three screenshots were visually inspected. The bundled video was probed: 61.44 seconds, H.264 1920×1080 with AAC audio. This validates container/stream metadata, not every frame or the remote embed's availability. The original remote embed and every local media file are preserved unchanged, with a local video fallback link added.

There was no tracked `.env`, database, resume PDF, private-key file, or matching historical path found in the reviewed history. A common OpenAI/AWS/private-key pattern scan across all **33 reachable commits** found no matches. This is a limited pattern check, not a comprehensive secret/security audit; image/video contents and unknown credential formats are outside that scan. `.env` variants and SQLite sidecars are now ignored while `.env.example` remains tracked.

## Changes and corrected claims

| Previous wording / inconsistency | Evidence-backed replacement or fix |
| --- | --- |
| `~€0.0003 per job` / analysis | Removed from README and environment comments: no usage logs, pricing/date assumptions, currency conversion or measured context sizes support it |
| "Schema migrations" | Table creation plus two additive startup column checks; no versioned migration system |
| "All data stays local" | Default persistence is local; OpenAI fit sends job/notes/selected profile and brief/full extracted resume; brief sends posting context even in mock fit mode |
| "Structured outputs", "calibrated scoring", "hard guardrails" | JSON-object mode, application parsing/response models, prompt rubric/reference examples; no strict schema, measured calibration, enforced score caps or guaranteed factual accuracy |
| Capture from "any LinkedIn job page" | Heuristic multi-strategy extraction for jobs pages, with manual review, truncation/capture limits and no reliability benchmark |
| Unqualified dedup / production robustness | Exact trimmed URL then normalized title/company; unchanged duplicate response, full scan, false merges and concurrency limits; local unauthenticated V1 |
| Automatic two-stage pipeline / five dimension scores | Two optional independent calls; fit can consume a saved brief; one overall score with five reasoning dimensions in prompt |
| Duplicate French markers labeled as straight apostrophes | Corrected intended straight-apostrophe variants; removed true duplicates and redundant noise filtering |
| Popup `v0.4` vs manifest `0.1.0` | Popup label now matches manifest; historical screenshot retains original label |
| Offer/OA dropdown displayed Archived | Detail dropdown now follows board grouping and displays Interview |
| Textless PDF shown as successful context | Resume UI reflects returned text, reports empty extraction separately from upload failure, and explains replacement of previous context |
| "backend .env" brief error / stale CORS comment | Root `.env` instructions and current-dashboard comment |

No analyzer logic, API dedup policy, database schema, product scope or media was replaced. Documentation preserves deeper information separately. Model preferences/omissions, stale outputs, lax update fields, permissive CORS and hard-coded local URLs are documented rather than silently redesigned.

## Executed checks

| Check | Result |
| --- | --- |
| `python -m compileall -q backend tests` | Passed |
| Imports through backend smoke suite | Passed; app, models, routers, PDF parser, mock and OpenAI prompt builder imported |
| `python -m unittest discover -s tests -v` | **9 tests passed**, temporary SQLite per test, empty key/mock environment; SDK construction blocked |
| `python -m pip check` | Passed: no broken declared requirements in installed environment |
| `npm --prefix apps/dashboard run build` | Passed after code and dependency changes: strict TypeScript + Vite production bundle |
| `node --check extension/content.js` and `extension/popup.js` | Passed |
| Synthetic Node VM extraction spot checks | Passed: both French apostrophe forms, line-prefix boundary cuts, mid-sentence preservation, author benefits, UI-noise cleanup, initial listener registration |
| Memory-only React server render of DetailPanel | Passed: all seven API statuses display the expected four-column grouping |
| Manifest/config static checks | Passed: MV3, declared permissions, referenced files, localhost API permission, popup version |
| `npm run dev` with isolated `.verification.db` | Both servers started; API health, save/duplicate, profile, mock analysis, status/notes update, list/latest analysis and dashboard HTTP checks passed; servers stopped and verification DB removed |
| Local Markdown paths and media references | Checked during final pass; all resolve |
| `git diff --check` | Passed during final pass |

The malformed-PDF test intentionally triggers a pypdf "EOF marker not found" diagnostic and confirms the API returns `422`; it is not a failed test. One-off Node harness checks needed a browser-location stub, Unicode-safe text for PowerShell piping, and a plain module wrapper; those were harness corrections, not additional product fixes.

No OpenAI request was made. No live LinkedIn/Chrome interaction or full browser drag-and-drop walkthrough was performed during cleanup. Synthetic helper checks and React server rendering do not establish browser/DOM reliability. Remote demo embedding was not required for verification.

## Small backend suite

[tests/test_backend_smoke.py](../tests/test_backend_smoke.py) uses standard-library unittest and FastAPI TestClient. Its `unittest.enterContext` helper requires Python 3.11+, while the application requires Python 3.10+. [requirements-dev.txt](../requirements-dev.txt) explicitly adds HTTPX; no new test framework, CI or broad fixture system was introduced. Tests cover:

- CRUD/status filtering, missing fields/invalid status, health and missing-job behavior.
- Exact URL dedup with trimmed lookup, no merge, and query-variant lookup misses.
- Title/company normalization across different locations/IDs/URLs and distinct-title insertion.
- Empty/partial profile updates and profile-aware mock scoring with negative-keyword precedence.
- Repeated deterministic analysis, newest result in detail/list/lookup, timestamps and ORM delete cascade.
- Synthetic PDF text extraction, textless replacement, filename rejection and parse failure.
- Missing OpenAI key and description errors, including the independent brief path.
- Prompt assembly without client construction: notes/resume/brief included, URL and stored-only preferences omitted.
- Lifespan startup adding the two known legacy columns and repeated checks remaining idempotent.

The legacy-column test uses SQLite `DROP COLUMN` (SQLite 3.35+); it simulates those two omissions rather than claiming compatibility with every historical schema. Temporary databases and dependency overrides keep tests away from a personal database. Smoke tests check application behavior, not LLM quality or public-hosting security.

## Environment and dependency findings

Verification used Windows PowerShell, Python **3.13.7**, Node **20.18.0**, npm **10.8.2**, TypeScript **5.9.3**, Vite **5.4.21**. The repo's `.python-version` remains **3.11.14**. Tested Python packages included FastAPI 0.142.2, Starlette 1.7.0, SQLAlchemy 2.1.3, Pydantic 2.13.5, uvicorn 0.54.0, pypdf 6.19.0, OpenAI SDK 3.24.0, HTTPX 0.28.1. This is an installed-environment snapshot, not a Python lock or support matrix.

Initial npm installs used local cache; Python dependency installation and npm advisory checks/fixes used network access. Product verification ran offline/loopback. Runtime Python requirements remain open lower bounds and have not undergone a dedicated vulnerability audit. A successful import/check with the installed SDK does not verify model availability or live OpenAI compatibility.

Root `npm audit` reported **0** affected packages. Dashboard audit initially reported **6** affected packages. `npm audit fix --ignore-scripts` updated eight transitive packages within existing ranges, including Browserslist, baseline-browser-mapping, PostCSS and nanoid; root/package manifests and application dependencies are unchanged. The updated dashboard lockfile is preserved.

At the end of the **4 October 2026** cleanup, dashboard audit exited nonzero with **2 affected packages (1 moderate, 1 high)**: esbuild and Vite. Relevant advisories included [esbuild development-server CORS](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99), [Vite source-map traversal](https://github.com/vitejs/vite/security/advisories/GHSA-4w7w-66w2-5vf9), [Windows alternate-path deny bypass](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff), and [Windows editor UNC handling](https://github.com/advisories/GHSA-v6wh-96g9-6wx3). These were dependency/tooling findings; a passing build was not a security clearance or proof of exploitability in this workflow. npm proposed Vite 6.4.3 via a force/major update. That upgrade was left outside the initial portfolio cleanup.

On **5 October 2026**, a bounded dependency patch pinned dashboard `vite` to **6.4.3** and `@vitejs/plugin-react` to **4.3.4**. The resulting Vite dependency tree uses esbuild **0.25.12**. React **18.3.1**, React DOM **18.3.1**, and TypeScript **5.9.3** remained unchanged; other lockfile changes are confined to the Vite/plugin dependency trees. No application, backend, extension or architecture changes were made.

The patch passed `npm ci` from the updated lockfile in `apps/dashboard` and `npm --prefix apps/dashboard run build`; installed-version inspection confirmed Vite **6.4.3**. Both `npm --prefix apps/dashboard audit` and root `npm audit` reported **0 vulnerabilities**. No `--force` or unrelated major upgrade was used. These checks resolve the previously reported Vite/esbuild npm findings in the installed tree; they are not a comprehensive security audit or a guarantee of application security.

## Reproduce a mock walkthrough without LinkedIn

Install/launch using [the README](../README.md), leave `AI_PROVIDER=mock` and the key empty, then open http://localhost:8000/docs. Submit `POST /jobs` with synthetic data:

```json
{
  "source": "manual",
  "title": "Synthetic Applied AI Engineer",
  "company": "Example Labs",
  "url": "https://example.test/jobs/portfolio-demo",
  "location": "Paris",
  "description": "Build LLM agents and backend services with Python and FastAPI."
}
```

Submit again to see the same ID with `200`, not a second row. Refresh the dashboard, open the job, save a note, drag it across columns, edit profile target keywords/stacks, and Analyze. The explanation should identify mock analysis. Generate brief returns a missing-key error with the key empty. Use a synthetic PDF for context; mock scoring does not inspect resume text.

This walkthrough writes to the configured local database. It is a reproducible demonstration procedure, not a claim that every browser step above was executed during this cleanup.
