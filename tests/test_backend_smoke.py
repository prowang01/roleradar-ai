"""Offline API checks: temporary SQLite, no personal data, no OpenAI calls.

Run from the repository root: python -m unittest discover -s tests -v
"""

import io
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


class BackendSmokeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="roleradar-smoke-")
        self.addCleanup(self.temp.cleanup)
        database_url = "sqlite:///" + (Path(self.temp.name) / "test.db").as_posix()
        self.enterContext(patch.dict(os.environ, {
            "DATABASE_URL": database_url, "AI_PROVIDER": "mock", "OPENAI_API_KEY": "",
        }))
        # Block SDK construction too: an unintended model path must fail offline.
        self.enterContext(patch("openai.OpenAI", side_effect=AssertionError("OpenAI forbidden in smoke tests")))

        from backend import main
        from backend.database import get_db

        self.main = main
        self.engine = create_engine(database_url, connect_args={"check_same_thread": False})
        self.addCleanup(self.engine.dispose)
        self.enterContext(patch.object(main, "engine", self.engine))
        session_factory = sessionmaker(bind=self.engine)

        def override_db():
            with session_factory() as session:
                yield session

        self.enterContext(patch.dict(main.app.dependency_overrides, {get_db: override_db}))
        self.client = self.enterContext(TestClient(main.app))

    def create_job(self, **fields):
        payload = {
            "title": "Applied AI Engineer", "company": "Example Labs",
            "url": "https://www.linkedin.com/jobs/view/123",
            "description": "Build LLM agents with a backend team.",
        }
        payload.update(fields)
        response = self.client.post("/jobs", json=payload)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_crud_status_filter_and_validation(self):
        self.assertEqual(self.client.get("/health").json()["status"], "ok")
        job = self.create_job()
        self.assertEqual(job["status"], "saved")
        self.assertIsNotNone(job["saved_at"])
        changed = self.client.patch(f"/jobs/{job['id']}", json={"status": "applied", "notes": "Prepare a demo"})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["notes"], "Prepare a demo")
        self.assertIsNone(changed.json()["applied_at"])  # Status alone does not set it.
        self.assertEqual(len(self.client.get("/jobs?status=applied").json()), 1)
        self.assertEqual(self.client.get("/jobs?status=saved").json(), [])
        self.assertEqual(self.client.patch(f"/jobs/{job['id']}", json={"status": "invalid"}).status_code, 422)
        self.assertEqual(self.client.post("/jobs", json={"title": "Missing company"}).status_code, 422)
        self.assertEqual(self.client.delete(f"/jobs/{job['id']}").status_code, 204)
        self.assertEqual(self.client.get(f"/jobs/{job['id']}").status_code, 404)

    def test_exact_url_duplicate_returns_existing_without_merging(self):
        job = self.create_job(url="  https://example.test/jobs/1  ")
        duplicate = self.client.post("/jobs", json={
            "url": job["url"], "title": "Changed title", "company": "Changed company",
            "description": "New text", "status": "applied",
        })
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.json()["id"], job["id"])
        self.assertEqual(duplicate.json()["description"], job["description"])
        self.assertEqual(duplicate.json()["status"], "saved")
        lookup = self.client.get("/jobs/lookup", params={"url": " " + job["url"] + " "}).json()
        self.assertTrue(lookup["found"])
        self.assertEqual(lookup["job"]["id"], job["id"])
        self.assertFalse(self.client.get("/jobs/lookup", params={"url": job["url"] + "?tracking=1"}).json()["found"])

    def test_normalized_duplicate_ignores_location_and_external_id(self):
        job = self.create_job(title="AI Engineer", company="Example, Inc.", external_job_id="123")
        duplicate = self.client.post("/jobs", json={
            "title": "ai-engineer", "company": "EXAMPLE INC", "location": "Another city",
            "url": "https://example.test/different-opening", "external_job_id": "999",
        })
        self.assertEqual(duplicate.status_code, 200)
        self.assertEqual(duplicate.json()["id"], job["id"])
        self.assertEqual(len(self.client.get("/jobs").json()), 1)
        self.create_job(title="Different Role", url=None)
        self.assertEqual(len(self.client.get("/jobs").json()), 2)

    def test_profile_changes_mock_and_negative_keyword_wins(self):
        job = self.create_job(title="Widget Builder", description="widget", company="Example", url=None)
        baseline = self.client.post(f"/jobs/{job['id']}/analyze").json()
        self.assertEqual(baseline["fit_score"], 5.0)
        self.assertIn("MOCK ANALYSIS", baseline["why"])
        self.assertEqual(self.client.get("/profile").json()["target_keywords"], [])
        profile = self.client.put("/profile", json={"target_keywords": ["widget"], "career_goals": "Build products"})
        self.assertEqual(profile.status_code, 200)
        positive = self.client.post(f"/jobs/{job['id']}/analyze").json()
        self.assertEqual(positive["fit_score"], 5.6)
        self.client.put("/profile", json={"avoid_keywords": ["widget"]})
        self.assertEqual(self.client.get("/profile").json()["career_goals"], "Build products")
        negative = self.client.post(f"/jobs/{job['id']}/analyze").json()
        self.assertEqual(negative["fit_score"], 3.0)
        self.assertEqual(negative["verdict"], "skip")

    def test_analysis_history_latest_lookup_and_delete_cascade(self):
        job = self.create_job()
        results = [self.client.post(f"/jobs/{job['id']}/analyze") for _ in range(2)]
        self.assertTrue(all(r.status_code == 201 for r in results))
        first, second = [r.json() for r in results]
        self.assertNotEqual(first["id"], second["id"])
        self.assertEqual(first["fit_score"], second["fit_score"])
        detail = self.client.get(f"/jobs/{job['id']}").json()
        self.assertEqual(detail["latest_analysis"]["id"], second["id"])
        self.assertIsNotNone(detail["analyzed_at"])
        self.assertEqual(self.client.get("/jobs").json()[0]["latest_analysis"]["id"], second["id"])
        lookup = self.client.get("/jobs/lookup", params={"url": job["url"]}).json()
        self.assertEqual(lookup["job"]["latest_analysis"]["id"], second["id"])
        self.assertEqual(self.client.delete(f"/jobs/{job['id']}").status_code, 204)
        with self.engine.connect() as conn:
            self.assertEqual(conn.execute(text("SELECT COUNT(*) FROM fit_analyses")).scalar(), 0)

    def test_resume_text_extraction_and_invalid_uploads(self):
        self.assertEqual(self.client.post("/profile/resume", files={"file": ("resume.txt", b"text")}).status_code, 400)
        self.assertEqual(self.client.post("/profile/resume", files={"file": ("resume.pdf", b"%PDF-invalid")}).status_code, 422)
        writer = PdfWriter()
        page = writer.add_blank_page(width=300, height=300)
        font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                                 NameObject("/Subtype"): NameObject("/Type1"),
                                 NameObject("/BaseFont"): NameObject("/Helvetica")})
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font}),
        })
        stream = DecodedStreamObject()
        stream.set_data(b"BT /F1 12 Tf 20 100 Td (Synthetic Python resume) Tj ET")
        page[NameObject("/Contents")] = stream
        output = io.BytesIO()
        writer.write(output)
        response = self.client.post("/profile/resume", files={"file": ("resume.pdf", output.getvalue(), "application/pdf")})
        self.assertEqual(response.status_code, 200)
        self.assertIn("Synthetic Python resume", response.json()["resume_text"])
        blank_writer = PdfWriter()
        blank_writer.add_blank_page(width=300, height=300)
        blank = io.BytesIO()
        blank_writer.write(blank)
        response = self.client.post("/profile/resume", files={"file": ("blank.pdf", blank.getvalue())})
        self.assertIsNone(response.json()["resume_text"])

    def test_missing_key_and_description_fail_without_model_call(self):
        job = self.create_job()
        # Brief service checks the key even though analysis is in mock mode.
        self.assertEqual(self.client.post(f"/jobs/{job['id']}/brief").status_code, 400)
        with patch.dict(os.environ, {"AI_PROVIDER": "openai"}):
            response = self.client.post(f"/jobs/{job['id']}/analyze")
            self.assertEqual(response.status_code, 400)
            self.assertIn("OPENAI_API_KEY", response.json()["detail"])
        self.client.patch(f"/jobs/{job['id']}", json={"description": None})
        self.assertIn("no description", self.client.post(f"/jobs/{job['id']}/brief").json()["detail"])
        self.assertEqual(self.client.post("/jobs/999/analyze").status_code, 404)

    def test_openai_context_builder_without_sdk_or_network(self):
        from backend.services.analyzer import OpenAIAnalyzer

        # Exercise prompt construction without constructing a client.
        analyzer = object.__new__(OpenAIAnalyzer)
        prompt = analyzer._build_prompt({
            "title": "Example role", "description": "Synthetic posting", "notes": "Synthetic note",
            "url": "https://excluded.example", "job_brief": {"requirements": ["Python"]},
        }, {"target_roles": ["Engineer"], "resume_text": "Synthetic CV",
            "target_contract": "EXCLUDED_CONTRACT", "preferred_locations": ["EXCLUDED_LOCATION"]})
        for included in ("Synthetic posting", "Synthetic note", "Synthetic CV", "Python", "Engineer"):
            self.assertIn(included, prompt)
        for excluded in ("excluded.example", "EXCLUDED_CONTRACT", "EXCLUDED_LOCATION"):
            self.assertNotIn(excluded, prompt)

    def test_additive_startup_columns_are_idempotent(self):
        # Simulate the two known legacy omissions in this isolated database.
        with self.engine.begin() as conn:
            conn.execute(text("ALTER TABLE user_profiles DROP COLUMN resume_text"))
            conn.execute(text("ALTER TABLE jobs DROP COLUMN job_brief_json"))
        # Restart lifespan rather than bypassing the production startup path.
        with TestClient(self.main.app) as restarted:
            self.assertEqual(restarted.get("/health").status_code, 200)
        self.main._run_migrations()
        with self.engine.connect() as conn:
            profile_columns = {r[1] for r in conn.execute(text("PRAGMA table_info(user_profiles)"))}
            job_columns = {r[1] for r in conn.execute(text("PRAGMA table_info(jobs)"))}
        self.assertIn("resume_text", profile_columns)
        self.assertIn("job_brief_json", job_columns)


if __name__ == "__main__":
    unittest.main()
