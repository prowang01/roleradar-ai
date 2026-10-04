# Architecture and implementation reference

Current V1 implementation, reviewed on 4 October 2026 against baseline `fdb9b37`. Cleanup fixes are recorded in [verification.md](verification.md); historical evidence is separated in [interview-guide.md](interview-guide.md). Start with [the README](../README.md) for the product overview and [ai-design.md](ai-design.md) for prompts and external data flow.

## Purpose and scope

The original README frames the problem as scattered postings, lost application context, duplicate tracking, and unclear priorities. The implemented response is capture, persistence, a visible pipeline, and optional candidate-aware advice. The analyzer's AI/FDE role taxonomy supports this framing. This evidence does not establish a personal origin story, user research, customer adoption, or hiring impact.

V1 is a single-user local application. There is no server-side LinkedIn fetcher, application automation, worker, hosted service, login, or organization model.

## End-to-end flow

1. The MV3 manifest injects `content.js` at `document_idle` on HTTPS LinkedIn jobs pages. The popup queries the active tab, requests extraction, and performs exact-URL backend lookup on opening.
2. If messaging fails because no receiver exists, the popup injects `content.js` with `chrome.scripting.executeScript` and retries. A window flag guards listener registration. Unexpected errors are surfaced separately. Declarations remain at script top level, so the flag is not proof that every repeated injection is safe.
3. Extraction reads the live DOM each time. Found values populate editable fields; missing results leave existing fields alone. Truncation warns the user to expand the posting; the extension does not click Show more itself.
4. Save creates a job or returns a duplicate. If exact lookup already found a job, Save PATCHes only its description. Applied saves if needed and PATCHes status. Analyze saves if needed and analyzes the persisted record; unsaved field edits on an existing job are not automatically analysis inputs.
5. The dashboard fetches jobs on mount/manual refresh. A `?jobId=` deep link from the popup opens an existing job. Search filters title/company locally; statistics use the full loaded list.
6. Status changes optimistically update React state, PATCH the API, then merge the response. Failure refetches records and displays an error; recovery still depends on that refetch succeeding. Notes save separately. No polling or live synchronization exists.
7. Profile editing and resume upload use the same API. Analysis reads the first profile if present; an absent profile is allowed. Brief generation and analysis run synchronously on request and persist results.

## Source map

| Area | Read first | Responsibility |
| --- | --- | --- |
| Bootstrap | [main.py](../backend/main.py), [database.py](../backend/database.py) | dotenv before imports, engine/session, lifespan, startup additions, CORS |
| Contracts | [models.py](../backend/models.py), [schemas.py](../backend/schemas.py) | tables, statuses/verdicts, request/response models |
| Jobs | [jobs.py](../backend/routers/jobs.py), [dedup.py](../backend/services/dedup.py) | CRUD, lookup, filtering, latest analysis, duplicates |
| Profile | [profile.py](../backend/routers/profile.py) | one profile, PDF extraction |
| AI | [analysis.py](../backend/routers/analysis.py), [analyzer.py](../backend/services/analyzer.py), [briefer.py](../backend/services/briefer.py) | context assembly, provider choice, prompts, persistence |
| Extension | [manifest.json](../extension/manifest.json), [content.js](../extension/content.js), [popup.js](../extension/popup.js), [popup.html](../extension/popup.html) | permissions, capture strategies, API actions, diagnostics |
| Dashboard | [App.tsx](../apps/dashboard/src/App.tsx), [api.ts](../apps/dashboard/src/api.ts), [types.ts](../apps/dashboard/src/types.ts) | client state, requests, status grouping |
| UI | [Board.tsx](../apps/dashboard/src/components/Board.tsx), [DetailPanel.tsx](../apps/dashboard/src/components/DetailPanel.tsx), [ProfileModal.tsx](../apps/dashboard/src/components/ProfileModal.tsx) | drag/drop, brief/analysis/notes, profile/resume |

`Column.tsx` supplies droppable columns; `JobCard.tsx` supplies draggable cards, verdicts and special status badges; `StatsRow.tsx` derives counts. CSS, React entry, Vite and TypeScript configs complete the client. Root npm scripts use concurrently to launch uvicorn and Vite. Two npm lockfiles cover root and dashboard dependencies separately.

## LinkedIn extraction and debugging

This is DOM integration rather than a stable platform API. Selector order and fallback scope matter because job search pages contain both result cards and an active detail view.

| Field | Strategies in order |
| --- | --- |
| LinkedIn ID | numeric `currentJobId` query parameter; `/jobs/view/{id}` URL; first matching job link |
| Title | known selectors; visible short `h1`; matching job link; document title; French selected-item text |
| Company | known selectors; visible short `/company/` link; document-title parsing; text following title |
| Location | known selectors; second visible `.tvm__text`; non-UI text following title/company |
| Description | known containers; About-the-job heading's parent/siblings; body text between markers; largest plausible block in a known detail panel |

Description extraction applies line-prefix end markers to stop before Premium upsells, hiring-team/company sections, and similar-job UI. It removes standalone Show more/less fragments and trailing ellipses/plus, normalizes whitespace, checks minimum lengths, and caps returned text at 10,000 characters. The final fallback rejects several French Premium block starts. English/French markers are supported, including straight/typographic apostrophes after cleanup.

Broad selectors can pick another card's company/location; headings can collide with author content; legitimate company sections may be cut; short postings can fail thresholds; long postings are clipped. A visible Show-more button is a heuristic warning and may belong to unrelated UI. No fixture suite or coverage matrix proves layout/locale reliability.

The debug panel preserves source names, job ID, raw/clean lengths, boundary markers, truncation and messaging errors. **Copy DOM** collects URL, title, up to 3,000 body-text characters, visible headings/buttons, links, and bounded candidate elements. It puts JSON in a textarea and attempts clipboard copy; it is not sent to the backend. Copied diagnostics may contain personal page content.

Debugging sequence: confirm URL matches the manifest; reload after extension updates; check receiver/injection flags; expand description; compare raw/clean lengths and end marker; inspect DOM recon; correct fields before saving. To replace a saved description, expand/refresh and Save again on the same URL.

## Persistence and deduplication

Default storage is `sqlite:///./roleradar.db`, resolved from the working directory. SQLAlchemy uses per-request sessions and SQLite `check_same_thread=False`. `Base.metadata.create_all` creates missing tables. `_run_migrations` uses PRAGMA/ALTER to add `user_profiles.resume_text` and `jobs.job_brief_json` if absent. These checks have no migration ledger, rollback, general schema conversion, or portability to another database despite the configurable URL. Old brief columns are TEXT; new tables declare SQLAlchemy JSON.

Three tables:

- `jobs`: source, external ID, identity/context, status, notes, salary fields, brief, lifecycle and audit timestamps.
- `user_profiles`: singleton convention `id=1`, targets/preferences/strategy/background and extracted resume text. Routes select `.first()` rather than enforcing singleton storage.
- `fit_analyses`: multiple results per job. Lists/detail/lookup expose the newest by `created_at`. Job deletion uses ORM delete-orphan cascade; SQLite foreign-key enforcement is not explicitly enabled.

Dedup is exactly:

1. For a nonblank URL, trim surrounding whitespace and query equality.
2. If no URL match, lowercase title/company and strip everything except ASCII `a-z0-9`, then compare both with every saved job.
3. Return the first match, otherwise insert.

The fallback runs even for different URLs. Location and external ID are ignored. Accents are stripped rather than transliterated; non-Latin identities may normalize to empty strings. Distinct openings with the same title/company can merge. The full scan is reasonable for a small list, but is not indexed identity matching or a concurrent uniqueness guarantee.

POST duplicates return the old object without merging fields, status or description. Exact lookup only matches the stored trimmed URL; query parameters and search URLs are not canonicalized. A new URL can show New yet dedup on Save. The historical re-save fix updates descriptions only when lookup already identified the record. Description/profile changes do not invalidate prior analysis or a stored brief.

## API contract

| Route | Current behavior |
| --- | --- |
| `GET /health` | status/version; not database/model readiness |
| `POST /jobs` | `201` new, `200` duplicate; saved timestamp set on creation in any status |
| `GET /jobs?status=...` | newest-created first, optional enum filter, eager-loaded analyses; no pagination |
| `GET /jobs/lookup?url=...` | exact trimmed URL; `{found, job}`; declared before dynamic ID route |
| `GET /jobs/{id}` | detail + latest analysis; `404` if absent |
| `PATCH /jobs/{id}` | supplied fields only; no automatic applied timestamp or state machine |
| `DELETE /jobs/{id}` | `204`; ORM removes analyses; `404` if absent |
| `GET /profile` | creates empty profile if absent |
| `PUT /profile` | updates supplied fields only, despite PUT verb; creates if absent |
| `POST /profile/resume` | `.pdf` filename required (`400` otherwise); parse errors `422`; stores stripped text or null |
| `POST /jobs/{id}/analyze` | `201` new result each time; missing config `400`, other analyzer exceptions `502` |
| `POST /jobs/{id}/brief` | description required; always OpenAI; replaces brief; config `400`, other provider/parse exceptions `502` |

Pydantic validates requests and serializes responses, but optional update fields permit explicit null even for some nonnullable columns. Empty identity strings are accepted by the API. Invalid model output and persistence errors are not uniformly translated to safe client errors. These are V1 gaps, not robustness guarantees.

## Dashboard and profile details

The board groups seven API statuses into four drop targets: Saved, Applied, Interview (OA/Interview/Offer), Archived (Rejected/Archived). Dropping onto the same visual column is a no-op and preserves special statuses. Moving to another writes its base status. The detail dropdown writes only four statuses and now displays special statuses using board grouping. Applied status does not populate `applied_at` automatically.

The pointer sensor requires 8px movement to distinguish dragging from opening details. DragOverlay supplies a visual clone. Cards support keyboard opening, but there is no dedicated keyboard drag sensor or complete accessibility verification. API calls trust TypeScript types without runtime client validation.

Profile lists use one item per line. Scalar preferences can be cleared; resume upload is separate from form saving. pypdf reads bytes in memory, joins page text, and stores text only. There is no OCR, original-file storage, page/byte cap, or extraction-quality check. A textless PDF replaces previous text with null. The cleanup UI reports missing extracted text instead of successful resume context.

## Local-first decisions and beyond-V1 proposals

Loopback defaults simplify installation for a personal tool. `.env` loads before modules read configuration; existing environment variables take precedence. The OpenAI key remains server-side. There is no encryption-at-rest guarantee: SQLite contains notes, profile and resume text.

Clients target localhost:8000; popup links target localhost:5173; the manifest permits localhost:8000. Vite requests 5173 but can choose another port if busy. CORS allows any origin, specified methods and Content-Type. It is a development convenience, not access control; an unauthenticated localhost API can still receive cross-origin requests. Do not expose it unchanged.

Beyond V1, prioritize validation/bounded inputs, result provenance/staleness, representative DOM fixtures, canonical identity + database uniqueness, versioned migrations, explicit configuration, and authentication/CORS/data protection before hosting. Pagination and retention should follow real data volume. Docker and worker queues are packaging/latency proposals, not implemented capabilities.
