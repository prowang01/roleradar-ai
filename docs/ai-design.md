# AI design, prompts, and data flow

Current implementation reference. The authoritative prompts are `_SYSTEM_PROMPT` in [analyzer.py](../backend/services/analyzer.py) and `_BRIEF_SYSTEM_PROMPT` in [briefer.py](../backend/services/briefer.py). Context assembly lives in [analysis.py](../backend/routers/analysis.py). This guide documents code, not measured model quality. See [architecture.md](architecture.md) for persistence and [interview-guide.md](interview-guide.md) for prompt history.

## Provider choice and mock behavior

`get_analyzer()` reads `AI_PROVIDER` for each analysis request, trims/lowercases it, and selects OpenAI only for `openai`. Missing values and unrecognized provider names select mock. The OpenAI constructor reads the key/model from environment. No key is stored in the database, extension, or dashboard.

The mock concatenates title, company, location, description and notes, lowercases them, and performs substring matching. It combines built-in positive keywords with profile target keywords/preferred stacks, and negative keywords with avoid keywords/red flags. Lists are deduplicated; identical positive/negative keywords count only as negative.

Score = `5 + 0.6 × positive hits - 2 × negative hits`, rounded to one decimal and clamped to 1–10. Negative hits force skip/hard_skip regardless of positive score; otherwise thresholds map to seven verdicts. Salary uses supplied numerical fields and the profile minimum. Seniority/company type are keyword heuristics. Resume text, experience summary and career goals do not affect mock scoring. The mock is deterministic and labeled in `why`, but its classifications and salary labels can be simplistic. It is a development/demo provider, not a model-quality baseline or calibrated recommendation engine.

## Optional brief, then optional fit analysis

These are independent requests, not an automatic two-call orchestration. `POST /jobs/{id}/brief` uses OpenAI regardless of `AI_PROVIDER`; it checks only key availability and description presence. Re-running overwrites `job_brief_json`. `POST /jobs/{id}/analyze` does not generate a brief automatically; it includes selected fields from a saved brief if present and appends a new fit-analysis row each time.

| Path | Settings | Result handling |
| --- | --- | --- |
| Brief | default `gpt-4o-mini`, temperature 0.1, `max_tokens=1500`, JSON-object mode | `json.loads`, stores dict, returns through `JobBriefResponse` |
| Fit | same model variable, temperature 0.2, `max_tokens=2000`, JSON-object mode | `json.loads`, constructs `AnalysisResult`, converts verdict to enum, persists and returns `FitAnalysisResponse` |

Both call synchronous `OpenAI().chat.completions.create`. No application-specific retry/timeout policy, usage accounting, streaming, queue, or caching is implemented; any SDK defaults are separate from repository logic.

The brief prompt requests company/team context, a synthesized role summary, responsibilities, required/preferred qualifications, benefits, seniority signals, salary/location/remote text, missing information and red flags. It tells the model to remove LinkedIn UI noise, avoid invention, use empty arrays for absent list content, and `Not mentioned.` for absent string content.

The fit prompt frames its one score as application priority relative to the candidate's goals. It asks for desirability, candidate fit, conversion likelihood, career upside and opportunity cost. These dimensions are reasoning instructions; the API does not return five numeric subscores or implement a mathematical product.

It includes role taxonomy, score bands, verdict bands, salary-unknown instructions, seniority caps and consulting distinctions. Examples contrast a desirable senior FDE stretch, hands-on GenAI consulting, and analytics/BI work with AI keywords. The rubric is opinionated toward AI product ownership and early-career scenarios; changing profile targets does not remove the system prompt's defaults.

## Exact external data boundary

Capture, ordinary CRUD, profile editing, PDF parsing and mock analysis make no OpenAI request. Installing dependencies and browsing LinkedIn are separate network activities. Adding a key alone does not automatically analyze anything. Clicking Generate brief can send data even while fit analysis is configured as mock.

| OpenAI request | Included in user prompt | Not included by current builder |
| --- | --- | --- |
| Brief | stored title, company, location, full stored description | notes, profile, resume, URL, status, external ID |
| Fit: job | title, company, location, numerical salary range, full description; notes if present | job URL and `role_type` are assembled by the route but not added by the prompt builder; source, external ID, status, timestamps are also omitted |
| Fit: saved brief | role summary, seniority signals, requirements, first five responsibilities, nice-to-have, salary/location unless `Not mentioned.`, potential red flags | company/team context, benefits, missing-information list |
| Fit: profile | target roles, career goals, experience summary, minimum/happy salary, stacks, target/avoid keywords, red flags, strategy | target contract, preferred locations, decision style are stored/editable but omitted by the route |
| Fit: resume | full extracted `resume_text`, if nonempty, under RESUME / CV | original PDF bytes/filename |

There is no truncation/redaction/token budget in the backend prompt builder. The extension caps descriptions at 10,000 characters, but manually created API jobs, notes and resume text have no comparable cap. Output token limits do not constrain input length. SQLite stores unencrypted text; OpenAI receives included content as an external provider. Repository code does not establish any external retention/privacy guarantee.

The prompt says to treat the resume as primary candidate evidence and not contradict explicitly stated experience. This is guidance; it is not factual verification. Empty/absent profiles are allowed, and the model still gets the opinionated rubric. A parsed profile alone does not imply all preferences influence recommendations.

## Structured output and scoring limits

`response_format={"type": "json_object"}` is JSON mode. There is no supplied JSON Schema, SDK schema parsing, or strict Structured Outputs enforcement. `AnalysisResult` is a dataclass, not runtime schema validation. The fit parser requires `verdict`/`fit_score`, converts the latter to float, and defaults other fields. The route then validates verdict as an enum. Response models validate serialization, but there are no bounded score fields, score/verdict consistency checks, or programmatic seniority/consulting caps.

Brief dictionaries are persisted before response-model serialization; a missing/wrong-type field may be stored or defaulted in the response rather than validated before commit. The frontend expects arrays in saved briefs. Malformed provider output, incomplete JSON, unexpected field types, or enum values can fail beyond the route's analyzer exception handler. Exceptions within service calls become `400` for ValueError (including JSON decode errors) and `502` for other exceptions. The catch blocks do not cover every later conversion/persistence/response-validation failure.

The historical word "calibration" refers to prompt examples and score instructions. There is no evaluation dataset, measured accuracy, hiring-probability calibration, reliability measurement, or evidence that caps are obeyed. Low temperature does not prove deterministic model behavior. Existing scores are suggestions, not probabilities.

## Cost and provenance

The previous `~€0.0003 per job` claim has no supporting token logs, billing sample, pricing/date assumptions, exchange rate, or measured job context sizes. It has been removed from README and `.env.example`. No replacement numerical claim is made. To estimate cost later, measure input/output tokens per call, multiply by the applicable model rates, and include both requests when both are used. The long rubric and full resume make a fixed per-job figure especially inappropriate.

Fit rows store neither provider nor model/prompt version/token usage; mock identity appears only in prose. Briefs have no generation provenance or dedicated timestamp. Edits to description/profile/resume do not invalidate existing outputs; analysis can incorporate a stale brief alongside updated raw text. Raw description remains available in the dashboard to compare against the brief.

## Beyond-V1 proposals

If extending this project, first validate provider output before persistence, enforce score/verdict bounds in code, add prompt/model/input provenance and stale-result detection, and test representative scoring cases. Separate untrusted posting/resume content from instructions and test prompt-injection attempts; there is no dedicated defense today. Review context selection and privacy disclosure, bound input size, measure token usage, and add clear error handling before evaluating queues or additional providers. These proposals are not implemented or verified capabilities.
