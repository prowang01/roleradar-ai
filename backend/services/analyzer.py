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
            verdict = "apply_only_if"
        elif score >= 4.0:
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


_SYSTEM_PROMPT = """You are a strict, objective career advisor. Analyze the job listing against the user profile.

Return ONLY a valid JSON object. No markdown. No explanation. No text outside the JSON.

Required fields:
{
  "verdict": <one of: "strong_apply", "apply", "apply_only_if", "maybe", "skip", "hard_skip">,
  "fit_score": <float 1.0-10.0>,
  "role_type": <string, e.g. "AI Engineer", "Backend Engineer">,
  "seniority_estimate": <string, e.g. "Junior", "Mid", "Senior", "Staff">,
  "company_type": <string, e.g. "Startup", "Scale-up", "Enterprise", "ESN/Consulting">,
  "salary_signal": <one of: "unknown", "below target", "matches target", "above target">,
  "career_upside": <string, honest 1-line assessment>,
  "learning_upside": <string, honest 1-line assessment>,
  "technical_depth": <one of: "Low", "Medium", "High">,
  "why": <string, 2-3 sentences, objective, no fluff>,
  "pros": [<list of concise strings>],
  "cons": [<list of concise strings>],
  "risks": [<list of concise strings>],
  "missing_skills": [<skills the user likely lacks for this role>],
  "matching_strengths": [<profile strengths that match the role>],
  "prep_topics": [<topics to prepare if applying>],
  "cv_keywords_to_highlight": [<keywords to emphasize on CV>],
  "recommended_action": <string, specific, actionable, direct>
}

Scoring rules (non-negotiable):
- Consulting / ESN / outsourcing / support / manual QA / no-code roles: fit_score <= 3, verdict "skip" or "hard_skip"
- AI Engineer, Applied AI, RAG, LLM, agents, data pipelines, founding team: score 7-10 if profile matches
- Too senior for profile (Staff/Principal when user is Mid): add seniority risk, cap score at 6
- No salary mentioned anywhere: salary_signal must be "unknown"
- Never default to positive. Be direct. Clearly say when a role is not worth applying to."""


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
            max_tokens=1500,
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
