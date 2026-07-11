import json
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import List, Optional

POSITIVE_KEYWORDS = [
    "founding", "ai engineer", "applied ai", "fde", "rag", "llm", "agents",
    "backend", "data pipeline", "data engineering", "machine learning",
    "platform engineer", "inference", "fine-tuning", "embeddings",
    "vector search", "recommendation system",
]

NEGATIVE_KEYWORDS = [
    "consulting", "esn", "support engineer", "manual qa", "no-code", "nocode",
    "client services", "managed services", "outsourcing", "bpo",
    "helpdesk", "tier 1 support", "tier 2 support",
]

SENIOR_KEYWORDS = [
    "staff engineer", "principal engineer", "director of engineering",
    "vp of engineering", "head of engineering", "chief architect",
]


@dataclass
class AnalysisResult:
    verdict: str
    fit_score: float
    role_type: str
    seniority_estimate: str
    company_type: str
    salary_signal: str
    career_upside: str
    learning_upside: str
    technical_depth: str
    why: str
    pros: List[str] = field(default_factory=list)
    cons: List[str] = field(default_factory=list)
    risks: List[str] = field(default_factory=list)
    missing_skills: List[str] = field(default_factory=list)
    matching_strengths: List[str] = field(default_factory=list)
    prep_topics: List[str] = field(default_factory=list)
    cv_keywords_to_highlight: List[str] = field(default_factory=list)
    recommended_action: str = ""


class BaseAnalyzer(ABC):
    @abstractmethod
    def analyze(self, job_data: dict, profile_data: Optional[dict] = None) -> AnalysisResult:
        ...


class MockAnalyzer(BaseAnalyzer):
    def analyze(self, job_data: dict, profile_data: Optional[dict] = None) -> AnalysisResult:
        # Scan all available job text, case-insensitive
        text = " ".join(filter(None, [
            job_data.get("title"),
            job_data.get("company"),
            job_data.get("location"),
            job_data.get("description"),
            job_data.get("notes"),
        ])).lower()

        profile = profile_data or {}

        # Build profile-aware keyword lists (normalised to lowercase)
        profile_positive = [kw.lower() for kw in
                            (profile.get("target_keywords") or []) +
                            (profile.get("preferred_stacks") or [])]
        profile_negative = [kw.lower() for kw in
                            (profile.get("avoid_keywords") or []) +
                            (profile.get("red_flags") or [])]

        # Merge with hardcoded lists; preserve order, deduplicate
        effective_negative = list(dict.fromkeys(NEGATIVE_KEYWORDS + profile_negative))
        # Negative wins: any keyword that appears in the negative list is removed
        # from the positive list so it can only score as a red flag.
        neg_set = set(effective_negative)
        effective_positive = [kw for kw in dict.fromkeys(POSITIVE_KEYWORDS + profile_positive)
                              if kw not in neg_set]

        positive_hits = [kw for kw in effective_positive if kw in text]
        negative_hits = [kw for kw in effective_negative if kw in text]
        senior_hits   = [kw for kw in SENIOR_KEYWORDS if kw in text]

        score = 5.0 + len(positive_hits) * 0.6 - len(negative_hits) * 2.0
        score = max(1.0, min(10.0, round(score, 1)))

        if negative_hits:
            verdict = "hard_skip" if score <= 2.5 else "skip"
        elif score >= 8.5:
            verdict = "strong_apply"
        elif score >= 7.0:
            verdict = "apply"
        elif score >= 5.5:
            verdict = "apply_as_stretch"
        elif score >= 4.0:
            verdict = "apply_only_if"
        elif score >= 3.5:
            verdict = "maybe"
        else:
            verdict = "skip"

        has_salary = job_data.get("salary_min") or job_data.get("salary_max")
        if has_salary:
            min_target = profile.get("minimum_salary_eur")
            job_max = job_data.get("salary_max")
            if min_target and job_max and job_max < min_target:
                salary_signal = "below target"
            else:
                salary_signal = "matches target"
        else:
            salary_signal = "unknown"

        if negative_hits:
            company_type = "ESN/Consulting"
        elif any(k in text for k in ["founding", "seed round", "series a"]):
            company_type = "Startup"
        elif any(k in text for k in ["series b", "series c", "scale-up"]):
            company_type = "Scale-up"
        elif any(k in text for k in ["enterprise", "fortune 500", "global corporation"]):
            company_type = "Enterprise"
        else:
            company_type = "Unknown"

        if senior_hits:
            seniority_estimate = "Staff/Principal"
        elif any(k in text for k in ["senior ", "sr.", " lead "]):
            seniority_estimate = "Senior"
        elif any(k in text for k in ["junior", "jr.", "entry level", "entry-level"]):
            seniority_estimate = "Junior"
        else:
            seniority_estimate = "Mid"

        risks = []
        if senior_hits:
            risks.append(f"Seniority risk — role signals Staff/Principal level ({', '.join(senior_hits)})")
        if not has_salary:
            risks.append("Salary undisclosed — risk of misalignment at offer stage")
        if negative_hits:
            risks.append(f"Red flags detected: {', '.join(negative_hits)}")

        technical_depth = (
            "High" if len(positive_hits) >= 3
            else "Medium" if positive_hits
            else "Low"
        )

        return AnalysisResult(
            verdict=verdict,
            fit_score=score,
            role_type=job_data.get("role_type") or "Software Engineer",
            seniority_estimate=seniority_estimate,
            company_type=company_type,
            salary_signal=salary_signal,
            career_upside=(
                "Low — consulting caps ownership and product impact"
                if negative_hits
                else "High — strong AI/backend signals suggest real product work"
                if len(positive_hits) >= 3
                else "Medium — needs deeper investigation"
            ),
            learning_upside=(
                "Low — limited technical depth in job signals"
                if negative_hits
                else "High — modern AI/ML stack signals"
                if positive_hits
                else "Medium — unclear from description alone"
            ),
            technical_depth=technical_depth,
            why=(
                f"[MOCK ANALYSIS — set AI_PROVIDER=openai for real results] "
                f"Keyword scan found {len(positive_hits)} positive signal(s) "
                f"({', '.join(positive_hits[:3]) if positive_hits else 'none'}) "
                f"and {len(negative_hits)} red flag(s) "
                f"({', '.join(negative_hits) if negative_hits else 'none'})."
            ),
            pros=(
                [f"Signal: {kw}" for kw in positive_hits[:5]]
                or ["No strong positive signals — add a full description for better results"]
            ),
            cons=(
                [f"Red flag: {kw}" for kw in negative_hits[:3]]
                or ["No obvious red flags from keyword scan"]
            ),
            risks=risks,
            missing_skills=["[Mock] Run with AI_PROVIDER=openai for skill gap analysis"],
            matching_strengths=(
                [f"Matches: {kw}" for kw in positive_hits[:5]]
                or ["[Mock] Run with AI_PROVIDER=openai for strength matching"]
            ),
            prep_topics=["Review job description in detail", "Research company recent news and culture"],
            cv_keywords_to_highlight=positive_hits[:6],
            recommended_action=(
                "Do not apply — strong negative signals. Run with AI_PROVIDER=openai to confirm."
                if negative_hits
                else "Consider applying — positive signals found. Run with AI_PROVIDER=openai for a full analysis."
            ),
        )


_SYSTEM_PROMPT = """You are a strict, objective career advisor evaluating job opportunities for a specific candidate.

Return ONLY a valid JSON object. No markdown. No explanation. No text outside the JSON.

Required fields:
{
  "verdict": <one of: "strong_apply", "apply", "apply_as_stretch", "apply_only_if", "maybe", "skip", "hard_skip">,
  "fit_score": <float 1.0-10.0>,
  "role_type": <string, e.g. "AI Engineer", "Forward Deployed Engineer", "Analytics Engineer">,
  "seniority_estimate": <string, e.g. "Junior", "Mid", "Senior", "Staff/Principal">,
  "company_type": <string, e.g. "Startup", "Scale-up", "Enterprise", "ESN/Consulting">,
  "salary_signal": <one of: "unknown", "below target", "matches target", "above target">,
  "career_upside": <string, honest 1-line assessment>,
  "learning_upside": <string, honest 1-line assessment>,
  "technical_depth": <one of: "Low", "Medium", "High">,
  "why": <string, 2-3 sentences — explain the score, name specific gaps and strengths>,
  "pros": [<list of concise strings>],
  "cons": [<list of concise strings>],
  "risks": [<list of concise strings>],
  "missing_skills": [<skills the user likely lacks for this role>],
  "matching_strengths": [<profile strengths that match the role>],
  "prep_topics": [<topics to prepare if applying>],
  "cv_keywords_to_highlight": [<keywords to emphasize on CV>],
  "recommended_action": <string — must include: (1) apply or not, (2) effort level, (3) specific blockers, (4) priority vs. stretch vs. fallback>
}


CORE PRINCIPLE:
fit_score answers: "Is this job worth applying to for this specific user?"
It measures desirability × candidate fit × conversion likelihood × career upside, relative to opportunity cost.
It is NOT a measure of how prestigious or attractive the role is.
High desirability alone → apply_as_stretch at most, never apply or strong_apply.


EVALUATION DIMENSIONS — assess all five explicitly before scoring:

1. Role desirability
   What is the actual work? Does it build toward the user's AI/engineering goals?
   Use the role taxonomy below.

2. Candidate fit
   Does the user's stated experience concretely match what the role requires?
   Name specific gaps (years, production systems, missing tech) and strengths (tech overlap, relevant domain, initiative).

3. Conversion likelihood
   What experience level does the role explicitly expect?
     0–2 years / junior / graduate         → realistic, no penalty
     2–4 years / mid-level                 → borderline; slight penalty for early-career profiles
     4–6 years / senior                    → low conversion; cap score at 6.5
     6+ years / staff / principal / lead   → very low conversion; cap score at 5.5
     No seniority stated                   → treat as stretch, score 5–7 based on other signals
     "Exceptional junior profiles welcome" → stretch, not impossible; score accordingly

4. Career upside
   Will this role move the user toward their goals? Consider: AI ownership, production systems,
   learning curve, equity signal, salary, company brand and trajectory.
   A stretch role with exceptional upside can still be worth one tailored attempt.

5. Opportunity cost
   High-effort application for low probability: note it explicitly, recommend low investment.
   Easy-to-get role misaligned with goals: score low even if conversion is likely.


ROLE TYPE TAXONOMY — use this to assess desirability:

Strongly aligned (positive signal):
  Applied AI engineer, AI product engineer, LLM/agent systems engineer
  Forward Deployed Engineer / Field AI Engineer / Solutions Engineer with hands-on AI
  Founding engineer or early-stage AI startup (≤ 30 people, AI-native)
  ML platform / AI infrastructure / inference systems
  AI research engineer with production responsibilities
  SWE embedded in AI-native product team with real ownership

Partially aligned (neutral to slight negative):
  GenAI / RAG engineer at ESN or consulting firm (real technical work but limited ownership)
  Data engineer with AI/ML components
  Backend SWE on an AI product (depends on ownership scope)
  Analytics engineer with some ML or automation
  AI consultant with hands-on technical work

Weakly aligned (negative signal, reduce score):
  Analytics engineer / BI engineer / data governance / data quality / reporting
  RPA / low-code / no-code / Power Platform / UiPath automation
  IT consulting / systems integrator without product ownership
  Customer success / technical account management / solutions consultant
  Specification writing / requirements gathering / functional analyst
  Support engineering / helpdesk / tier-1 or tier-2 support


SCORING GUIDE:
  9–10 : Excellent realistic fit — meets most requirements, highly aligned, apply immediately.
  7–8  : Good fit — worth prioritising; some manageable gaps, conversion is plausible.
  5–6  : Stretch — high upside OR significant fit gaps; apply with tailored effort if justified.
  3–4  : Weak fit or low-value opportunity — not worth prioritising.
  1–2  : Skip — clearly misaligned role, very low conversion, or poor career upside.

VERDICT MAPPING:
  strong_apply     → score ≥ 8.5 : strong realistic candidate, prioritise immediately.
  apply            → score 7.0–8.4 : good fit, worth prioritising, manageable gaps.
  apply_as_stretch → score 5.5–6.9 : high upside but low conversion; one tailored attempt is justified, do not over-invest.
  apply_only_if    → score 4.0–5.4 : apply only for volume, entry point, or specific condition; not a priority.
  maybe            → score 3.5–3.9 : significant uncertainty — key information missing or truly marginal.
  skip             → score 2.0–3.4 : not worth applying given the user's goals and profile.
  hard_skip        → score < 2.0  : clearly misaligned; pure support / helpdesk / no-code / spec-writing ESN.


HARD RULES (non-negotiable):

ESN / consulting — distinguish carefully:
  Pure ESN: support, helpdesk, no-code, spec-writing, delivery with zero technical AI ownership
    → fit_score ≤ 2.0, hard_skip. Consulting/ESN model caps ownership and career trajectory.
  ESN WITH genuine GenAI/RAG/LLM hands-on technical work (Python, FastAPI, real model integration)
    → fit_score 4.0–6.0, apply_only_if. Flag consulting environment as career risk in cons/risks.
    → Do NOT hard_skip. Do NOT score above 6.0 regardless of technical keywords.

Seniority mismatch:
  Role requires 4–6 years AND user has < 2 years → cap score at 6.5, flag in risks.
  Role requires 6+ years OR staff/principal/lead AND user has < 2 years → cap score at 5.5, flag in risks.
  Role is junior/graduate/0–2 years → no seniority penalty.

Other:
  Salary not mentioned → salary_signal = "unknown". Never infer or assume.
  Do not invent facts about the company. Only use the job description and user profile.
  Top-tier company brand does not raise the score. Evaluate conversion honestly.


CALIBRATION ANCHORS — use these as reference points when scoring:

ANCHOR A — High desirability, seniority mismatch, low conversion:
  Example: OpenAI Forward Deployed Engineer, Paris.
  Signals: frontier models, production AI deployment, customer-facing, full-stack, 5+ years required.
  Expected: fit_score 5.8–6.5 | verdict: apply_as_stretch
  Why: Career value is exceptional (OpenAI brand, FDE role, frontier AI). But conversion is low:
  the role expects 5+ years, owned production AI deployment, and customer-facing delivery experience.
  Correct recommended_action: "Apply as a high-upside stretch. Extremely aligned with long-term goals,
  but conversion is low. Apply with a tailored message if cost is minimal. Do not over-invest
  compared to more realistic AI/FDE opportunities."
  WRONG: do not score this 8–9 because of OpenAI's brand.

ANCHOR B — Technical stack aligned, consulting environment:
  Example: Sopra Steria IA Engineer, RAG/Mistral/LangChain/LlamaIndex/FastAPI/Python, financial services.
  Signals: GenAI tech stack is real; ESN company; client delivery; requirements gathering; specs.
  Expected: fit_score 4.5–5.8 | verdict: apply_only_if
  Why: Technical keywords (RAG, Python, FastAPI, Mistral) match the user's stack. But the ESN/consulting
  model means client delivery, requirements, and limited product ownership. Technical alignment alone
  does not justify a higher score when the work environment caps ownership and trajectory.
  Correct recommended_action: "Apply only if you want volume or a safer GenAI entry point.
  Quick-apply only — not a priority. Ask about hands-on coding depth and real model ownership
  before investing time."
  WRONG: do not score this 7–8 based on technical keywords alone.

ANCHOR C — AI keywords present, core work is analytics/BI:
  Example: Analytics Engineer, SQL/Python/data modeling/BI/data governance/Power Platform/UiPath, logistics.
  Signals: Python and SQL present; core work is analytics, BI, governance, RPA; not AI systems.
  Expected: fit_score 3.0–4.5 | verdict: skip or apply_only_if
  Why: Python and SQL are not sufficient to make this a relevant AI role. The actual work is
  analytics, data quality, BI reporting, and RPA — not AI systems engineering, not product ownership.
  This would move the user toward data office responsibilities rather than AI/product engineering.
  Correct recommended_action: "Skip unless you need a fallback. Python and SQL are here, but the
  core work is analytics and governance — not aligned with your AI/product engineering trajectory."
  WRONG: do not score this 6–7 because it mentions Python or has some AI mentions.


MISSING INFORMATION — name it explicitly in the relevant fields:
  "Salary not mentioned.", "Equity not mentioned.", "Seniority level not stated.",
  "Technical depth unclear from description.", "Ownership scope not specified."
  Do not fill gaps with assumptions or optimistic defaults.


RECOMMENDED ACTION FORMAT — must include all four:
  1. Whether to apply and with what verdict
  2. Effort level: prioritise / tailored-apply / quick-apply / skip
  3. Specific blockers or gaps the user must address
  4. Whether this is a priority, a stretch, a fallback, or a skip

Good examples:
  "Strong apply. Prioritise. This is aligned and realistic — apply immediately and prepare thoroughly."
  "Apply. Good fit. Address [specific gap] in your cover letter. Tailored application."
  "Apply as a stretch. High upside, low conversion — send one tailored application, do not over-invest. Key blocker: [X]."
  "Apply only if you want volume or a safer entry point. Quick-apply only. Not a priority."
  "Skip. [Specific reason — role type, seniority, environment]. Misaligned with your target trajectory."
  "Hard skip. Pure consulting/ESN delivery — minimal technical ownership, caps career trajectory."


SCORE REDUCTION TRIGGERS — include relevant ones in cons and risks:
  - Role type mismatch: analytics/BI/governance/RPA vs. AI systems engineering
  - Consulting/ESN environment: delivery-focused, client specs, limited product ownership
  - Seniority mismatch: role expects significantly more experience than the user has
  - Candidate skill gaps: missing production AI, missing key tech, insufficient years of experience
  - Low career upside: commodity work, no AI ownership, no learning velocity
  - Very high competition relative to current profile stage
  - Location or contract mismatch (if specified in profile)

Never default to positive. Never round up to seem encouraging. Be direct."""


class OpenAIAnalyzer(BaseAnalyzer):
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ValueError(
                "AI_PROVIDER is set to 'openai' but OPENAI_API_KEY is missing or empty. "
                "Add OPENAI_API_KEY=<your-key> to your .env file."
            )
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key)
        self._model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    def analyze(self, job_data: dict, profile_data: Optional[dict] = None) -> AnalysisResult:
        prompt = self._build_prompt(job_data, profile_data)
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
            max_tokens=2000,
            response_format={"type": "json_object"},
        )
        data = json.loads(response.choices[0].message.content)
        return AnalysisResult(
            verdict=data["verdict"],
            fit_score=float(data["fit_score"]),
            role_type=data.get("role_type", ""),
            seniority_estimate=data.get("seniority_estimate", ""),
            company_type=data.get("company_type", ""),
            salary_signal=data.get("salary_signal", "unknown"),
            career_upside=data.get("career_upside", ""),
            learning_upside=data.get("learning_upside", ""),
            technical_depth=data.get("technical_depth", ""),
            why=data.get("why", ""),
            pros=data.get("pros", []),
            cons=data.get("cons", []),
            risks=data.get("risks", []),
            missing_skills=data.get("missing_skills", []),
            matching_strengths=data.get("matching_strengths", []),
            prep_topics=data.get("prep_topics", []),
            cv_keywords_to_highlight=data.get("cv_keywords_to_highlight", []),
            recommended_action=data.get("recommended_action", ""),
        )

    def _build_prompt(self, job_data: dict, profile_data: Optional[dict]) -> str:
        lines = [
            f"JOB TITLE: {job_data.get('title', 'N/A')}",
            f"COMPANY: {job_data.get('company', 'N/A')}",
            f"LOCATION: {job_data.get('location', 'N/A')}",
            f"SALARY RANGE: {job_data.get('salary_min', 'N/A')} – {job_data.get('salary_max', 'N/A')} EUR",
            "",
            "DESCRIPTION:",
            job_data.get("description") or "No description provided.",
        ]
        if job_data.get("notes"):
            lines += ["", "USER NOTES:", job_data["notes"]]
        if profile_data:
            lines += [
                "",
                "USER PROFILE:",
                f"  Target roles: {', '.join(profile_data.get('target_roles') or ['Not specified'])}",
                f"  Career goals: {profile_data.get('career_goals') or 'Not specified'}",
                f"  Current experience: {profile_data.get('current_experience_summary') or 'Not specified'}",
                f"  Min salary (EUR): {profile_data.get('minimum_salary_eur') or 'Not specified'}",
                f"  Happy salary (EUR): {profile_data.get('happy_salary_eur') or 'Not specified'}",
                f"  Preferred stacks: {', '.join(profile_data.get('preferred_stacks') or ['Not specified'])}",
                f"  Target keywords: {', '.join(profile_data.get('target_keywords') or ['Not specified'])}",
                f"  Keywords to avoid: {', '.join(profile_data.get('avoid_keywords') or ['None'])}",
                f"  Red flags: {', '.join(profile_data.get('red_flags') or ['None'])}",
                f"  Strategy: {profile_data.get('strategy') or 'Not specified'}",
            ]
        return "\n".join(lines)


def get_analyzer() -> BaseAnalyzer:
    provider = os.getenv("AI_PROVIDER", "mock").strip().lower()
    if provider == "openai":
        return OpenAIAnalyzer()
    return MockAnalyzer()
