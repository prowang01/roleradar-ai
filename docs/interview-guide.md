# Interview and project reconstruction guide

Use this with [architecture.md](architecture.md), [ai-design.md](ai-design.md), and [verification.md](verification.md). It preserves what code and git history establish so a future conversation can prepare interviews without inventing experiences.

## Briefing for a fresh AI conversation

> Read the README, the three technical guides, the source map, and relevant git diffs before preparing answers. RoleRadar AI is a completed local V1 portfolio project: Chrome MV3 LinkedIn capture, FastAPI/SQLAlchemy/SQLite storage and dedup, React/TypeScript/dnd-kit pipeline, profile/PDF text context, deterministic mock scoring and optional OpenAI JSON-mode brief/fit calls. Preserve the distinction between current implementation, historical commits, and proposed improvements. Do not infer users, deployment, outcome metrics, measured model quality, or personal incidents. Ask the owner for any personal motivation, timeline, collaboration or result details that the repository cannot establish.

Baseline before this cleanup: `fdb9b37`. Relevant source and history remain in the repository. Retrieve evidence with `git show <hash> -- <path>`; commit titles alone are not proof of a validated outcome. The commit `807c7c0` titled "Validate backend MVP locally" changes only `.python-version`, so it does not contain a test report.

## A defensible project pitch

"RoleRadar AI connects browser context to a local decision workflow. A Chrome extension reads a LinkedIn job, exposes extraction diagnostics, and saves it to a FastAPI/SQLite API. A React board tracks the application pipeline. Users can add goals and resume text, then explicitly request an optional AI brief or fit recommendation. The challenging parts were capturing useful text from a noisy DOM, defining duplicate behavior, and keeping an opinionated scoring prompt distinct from proven model quality. The mock provider makes the core workflow demonstrable without model access."

Adapt ownership language only to your actual contribution. The code supports the technical description; it does not establish who made every decision, how long it took, or who reviewed it.

## Historical evidence

The following entries distinguish inspected implementation changes from inferred reasoning. Dates come from git metadata, not a reconstructed project diary.

| Commits | Visible change / evidence | Safe interview angle |
| --- | --- | --- |
| `bd75c06`, `cb5513a` (30 June 2026) | refresh/lookup work followed by broader `/jobs/*` manifest coverage, missing-receiver injection fallback, listener guard | Separate transport/injection failure from empty extraction; reload stale tabs after extension changes |
| `34440f4`, `c51fb30` (30 June 2026) | debug panel and DOM recon; ordered selectors plus visible headings, links, document-title and body-text fallbacks | Instrument uncertainty before changing selectors; inspect what actually reached the extractor |
| `511edd9`, `694c1a4`, `b38751f`, `0dddf18`, `71586e2` (30 June–1 July 2026) | repeated extraction refinements; heading boundaries, cleanup and line-prefix Premium cuts | More text is not always better context; preserve author benefits while removing UI contamination |
| `71586e2` (1 July 2026) | end markers change from full-line equality to line-prefix matching | A heading with a suffix such as "avec Premium" evaded whole-line matching; boundary semantics matter |
| `af6f1b0` (15 July 2026) | skips Premium insight-card blocks in largest-panel fallback; requires meaningful cleaned length | A last-resort heuristic can preferentially select the wrong large block; filter before selecting |
| `3682450` (15 July 2026) | Save PATCHes a known job's freshly extracted description instead of only returning its existing record | Dedup and refresh are different operations; expanded source content needs an explicit update path |
| `fe14a82` (11 July 2026) | dashboard-triggered analysis and profile-aware context | Connect a recommendation to candidate context rather than job attractiveness alone |
| `00bc431`, `57d5500` (11 July 2026) | stretch/conditional verdicts, seniority guidance, consulting distinctions, reference examples | Prompt iteration to reduce optimistic prioritization; no measured calibration improvement is evidenced |
| `447243c` (11 July 2026) | PDF text extraction, profile storage, resume prompt section, additive column check | Preserve a factual context source while understanding parse quality and privacy boundaries |
| `cb49415` (11 July 2026) | independent brief endpoint, stored brief, raw description retained, selected brief context in fit prompt | Separate extraction from judgment, while recognizing stale summaries and two-call cost |
| `cbb1284` (11 July 2026) | shared latest-analysis/profile helpers, removed unused popup fetch, narrower frontend provider-error classification | Remove duplicated behavior and distinguish config errors from other rejected requests |
| `3fce39e`, `10e7a46` | one-command local launch; popup job deep link | Reduce demonstration friction while documenting hard-coded local assumptions |
| `1c09706`, `de12c50`, `a2ce156` | screenshot/video artifacts | Show actual V1 UI; screenshots do not establish adoption, scoring correctness or deployment |

The motivations in the final column are technical interpretations of the diffs. They are not verified personal recollections or production incidents.

## STAR answer scaffolds

Use qualitative code outcomes until you can supply genuine measured results. Do not convert a successful patch into a reliability percentage or time-saving claim.

**DOM capture/debugging**

- Situation: a LinkedIn jobs page has result cards, detail content, collapsed text and Premium UI; history records repeated extraction refinements.
- Task: capture enough trustworthy posting context for persistence and analysis.
- Action: explain ordered selectors/fallbacks, extraction provenance, raw/clean lengths, DOM recon, line-prefix boundaries, and Premium fallback filtering. Walk through `71586e2` and `af6f1b0`.
- Result: code now rejects those identified noise blocks and offers manual corrections. Live-layout reliability has not been benchmarked. Add your actual debugging sequence only if remembered or independently recorded.

**Deduplication versus updated source content**

- Situation: duplicate POST returns the existing job without merging new content.
- Task: allow expanded descriptions to replace earlier saved captures.
- Action: `3682450` adds description PATCH on Save when exact lookup found the record.
- Result: re-saving the same known URL updates description without resetting status. URL variants can still miss lookup and fall into no-merge POST dedup; analysis/brief staleness remains.

**AI judgment and honest prioritization**

- Situation: job attractiveness and candidate fit are different questions. History shows stretch-role rubric changes.
- Task: make the model distinguish priority, stretch, fallback and skip.
- Action: seniority caps and examples in `00bc431`/`57d5500`; candidate profile/resume evidence; explain why mock scoring is a different heuristic.
- Result: a more explicit prompt and additional verdict types are implemented. There is no before/after eval proving better accuracy or calibration.

**Scope and engineering trade-offs**

- Situation: V1 combines a browser extension, API, database, dashboard and optional model integration.
- Task: make an end-to-end local tool that is easy to demonstrate.
- Action: SQLite, mock default, explicit per-job requests, synchronous model calls, four visible board columns and diagnostics.
- Result: the workflow is inspectable and mock paths pass deterministic smoke checks. Claims about commercial impact or personal delivery deadlines need separate evidence.

For behavioural answers about failure, conflict, stakeholder negotiation, ambiguity or prioritization, use these as technical anchors and supply your real circumstances. The repository does not document teammate disagreements, customers, deadline pressure, or an employment incident.

## Architecture and trade-off questions

| Question | Talking points grounded in V1 |
| --- | --- |
| Why an extension rather than a backend scraper? | User's current rendered DOM; editable preview; no automated browsing; selectors are brittle and page-global fallbacks may mix content |
| Why SQLite/SQLAlchemy? | Small personal dataset, simple setup/session/relationships; full-scan dedup and SQLite-only startup checks limit growth/portability |
| What does "deduplicated" actually mean? | Trimmed exact URL then ASCII-normalized title/company; no external-ID key, URL canonicalization or database uniqueness; `200` means unchanged record |
| Why mock-first? | Offline development and demonstration of the product path; deterministic checks; not evidence for model accuracy; brief still uses OpenAI |
| Is it a two-stage AI pipeline? | Two optional endpoints; fit includes a saved brief but can run directly; full raw description remains in context |
| Are outputs schema-enforced? | JSON-object mode + parser/dataclass/response models; not strict provider schema; no score bounds or rule enforcement |
| What leaves the machine? | Brief sends posting fields; OpenAI fit sends description/notes/selected profile and brief/full extracted resume; PDF upload parses locally |
| How does drag/drop work? | 8px pointer threshold, droppable columns, overlay, optimistic PATCH and failure refetch; four visual columns group seven statuses |
| What is the migration strategy? | Create tables + two missing-column additions; no migration versions/rollback; SQLite assumptions despite DATABASE_URL |
| How do you control cost/latency? | User-triggered calls and output caps; no usage measurement, input budget, app retry/timeout policy or queue; no fixed per-job price |
| Can it serve other users? | One local profile and no auth/tenancy; opinionated rubric; secure hosting and product validation would be new work |

## Debugging prompts and expected reasoning

1. **Popup says no receiver.** Check tab URL/manifest match, install/update state, injection flags, then reload. Do not immediately change DOM selectors.
2. **Title exists but description is missing.** Expand Show more, refresh extraction, inspect source/length markers, then DOM recon. Thresholds may reject short content.
3. **Company/location belongs to a different card.** Inspect page-global fallback ordering and currentJobId; visible-card selection is not fully scoped.
4. **A different posting returns an existing ID.** Compare normalized title/company, not just URLs; external ID and location are ignored. Explain race/collision limits.
5. **New expanded description has no effect on analysis.** Save before Analyze; check exact lookup versus POST duplicate; inspect stale brief; re-analysis appends a row rather than replacing history.
6. **Mock score changes after editing preferences.** Target keywords/stacks add positive hits, avoid/red flags add negative hits, negatives win. Resume changes do not influence mock.
7. **Brief works with AI_PROVIDER=mock.** Brief service checks key/model independently of fit provider. This is expected behavior and must be disclosed.
8. **Salary is unknown although description mentions it.** Mock only uses numerical fields; extraction does not populate structured salary automatically. OpenAI receives text but its response remains unverified.
9. **Blank PDF returns success from API.** Textless PDFs save null; pypdf has no OCR. The cleanup UI reports no extracted context; a prior resume may have been replaced.
10. **Archived shown for an Offer record.** The API/board group Offer under Interview; cleanup corrects the dropdown's earlier inconsistent fallback.
11. **Malformed model JSON breaks the UI.** Trace JSON parsing, dataclass, enum conversion, commit and response validation; not every failure is caught before storage. Explain a future validation boundary.
12. **Status update fails while API goes offline.** Optimistic UI refetches on failure; if that refetch fails too, rollback is not guaranteed. Avoid claiming robust recovery under every failure.

## What to improve beyond V1

Prioritize evidence and correctness: representative capture fixtures, canonical identity and unique constraints, pre-persistence AI schema checks, score/verdict invariants, context provenance/staleness, prompt evaluations, bounded inputs and token logs. Then address deployment requirements: configurable origins/ports, authentication, safe error responses, data protection, versioned migrations, dependency maintenance and controlled hosting. OCR, Docker, queues and new integrations are optional product choices requiring justification, not an unfinished V1 checklist.

## Portfolio claim discipline

Supported: implemented end-to-end local workflow; multiple DOM strategies and diagnostic tooling; deterministic mock tests; profile/resume prompt assembly; saved briefs and analysis history; explicit development trade-offs.

Unsupported: `~€0.0003 per job`; all content remaining local during OpenAI calls; proven calibration; reliable scraping across all pages; production robustness; public deployment; adoption or application-success metrics. Screenshot job counts are demo state. Do not turn prompt instructions called "hard rules" into enforced application guarantees.

Before an interview, walk through the mock workflow, one DOM extraction diff, one dedup collision, and exact prompt inputs. Use the demo for visual explanation and tests for reproducible behavior. Ask the owner separately for actual motivation, individual ownership, elapsed development time, collaboration, and any measured outcomes.
