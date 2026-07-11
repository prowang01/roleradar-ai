import json
import os
from typing import Optional

_BRIEF_SYSTEM_PROMPT = """You are a job description parser. Extract structured information from the raw job description.
Return ONLY a valid JSON object. No markdown, no explanation, no text outside the JSON.

Required fields:
{
  "company_context": <string — company background, mission, product; "Not mentioned." if absent>,
  "team_context": <string — team structure, size, working style; "Not mentioned." if absent>,
  "role_summary": <string — YOUR own 2-3 sentence synthesis of the role, not copy-pasted text>,
  "responsibilities": [<concise single-line bullet strings>],
  "requirements": [<required qualifications, skills, and experience>],
  "nice_to_have": [<preferred but not required skills>],
  "benefits": [<salary, equity, perks, remote policy — only what is explicitly mentioned>],
  "seniority_signals": [<explicit seniority signals: years required, level, title — only what is stated>],
  "salary_location_remote": <string — salary range, location, remote/hybrid/onsite if stated; "Not mentioned." if absent>,
  "missing_information": [<important items not mentioned: salary, equity, seniority, tech stack, etc.>],
  "potential_red_flags": [<concerning signals if any; empty array [] if none>]
}

CLEANING RULES — strip the following entirely before extracting:
- LinkedIn Premium upsell blocks ("See who works at…", "Get full access…", "Unlock who's hiring…", etc.)
- "People you can contact" / "Personnes que vous pouvez contacter" sections
- Generic "About the company" boilerplate not directly part of the role posting
- "Show more" / "Voir plus" / "See less" / "Voir moins" button text artifacts
- LinkedIn footer text, sign-in prompts, similar job suggestions
- Duplicate or repeated content
- Any text clearly not from the original job posting

OUTPUT RULES:
- Use empty array [] for list fields with no relevant content.
- Use "Not mentioned." for string fields with no relevant content.
- Keep responsibilities and requirements as concise single-line bullets, not full paragraphs.
- role_summary must be YOUR synthesis — not copy-pasted text from the posting.
- Do not invent information absent from the description."""


class BriefService:
    def __init__(self) -> None:
        api_key = os.getenv("OPENAI_API_KEY", "").strip()
        if not api_key:
            raise ValueError(
                "OPENAI_API_KEY is missing or empty. "
                "Add OPENAI_API_KEY=<your-key> to your .env file to use brief generation."
            )
        from openai import OpenAI
        self._client = OpenAI(api_key=api_key)
        self._model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    def generate(
        self,
        title: str,
        company: str,
        location: Optional[str],
        description: str,
    ) -> dict:
        prompt = "\n".join([
            f"JOB TITLE: {title}",
            f"COMPANY: {company}",
            f"LOCATION: {location or 'Not specified'}",
            "",
            "RAW JOB DESCRIPTION:",
            description,
        ])
        response = self._client.chat.completions.create(
            model=self._model,
            messages=[
                {"role": "system", "content": _BRIEF_SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
            max_tokens=1500,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)
