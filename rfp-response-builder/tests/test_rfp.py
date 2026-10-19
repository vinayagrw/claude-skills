import csv, json, sys, tempfile, unittest
from datetime import date
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import split_questionnaire as sq, match_answers as ma, consistency_check as cc

TOPICS = ["encryption at rest", "encryption in transit", "single sign on", "multi factor authentication", "penetration testing",
          "incident response", "data retention", "backup", "uptime sla", "subprocessors"]

class T(unittest.TestCase):
    def setUp(self):
        self.d = Path(tempfile.mkdtemp())
        self.q = self.d / "sig.csv"
        with self.q.open("w", newline="") as f:
            w = csv.writer(f); w.writerow(["ID", "Section", "Question", "Response"])
            for i in range(30):
                w.writerow([f"S-{i+1}", "Security", f"Do you support {TOPICS[i % 10]} for variant {i}?", ""])
        self.lib = [{"id": "l1", "question": "Do you support encryption at rest?", "answer": "Yes. AES-256.", "topic": "encryption at rest", "source": "kb/sec.pdf#3", "owner": "Security", "last_verified": "2026-06-01"},
                    {"id": "l2", "question": "Do you support single sign on?", "answer": "Yes. SAML and OIDC.", "topic": "single sign on", "source": "kb/sso.md", "owner": "IAM", "last_verified": "2024-01-01"}]

    def test_split_30(self):
        qs = sq.rows_from_table(list(csv.reader(self.q.open())))
        self.assertEqual(len(qs), 30); self.assertEqual(qs[0]["id"], "S-1"); self.assertEqual(qs[0]["section"], "Security")

    def test_split_text(self):
        qs = sq.rows_from_text("# Access\n1. Do you enforce MFA for admins?\nNotes here\n- Describe your backup policy.")
        self.assertEqual([q["section"] for q in qs], ["Access", "Access"])

    def test_confidence_and_sources(self):
        qs = sq.rows_from_table(list(csv.reader(self.q.open())))
        rows = ma.match(qs, self.lib, today=date(2026, 10, 19))
        for r in rows:
            self.assertTrue(r["source"] or r["confidence"] == "red", r)
        sso = [r for r in rows if "single sign" in r["question"]]
        self.assertTrue(all(r["confidence"] == "amber" for r in sso), "stale source must be amber")
        self.assertTrue(any(r["confidence"] == "green" for r in rows))
        self.assertTrue(any(r["confidence"] == "red" for r in rows))

    def test_no_source_is_red(self):
        rows = ma.match([{"id": "x", "question": "Do you support encryption at rest?"}], [dict(self.lib[0], source="")])
        self.assertEqual(rows[0]["confidence"], "red")

    def test_consistency(self):
        rows = [{"id": "a", "topic": "uptime", "answer": "We commit to 99.9% uptime."}, {"id": "b", "topic": "uptime", "answer": "Uptime is 99.95%."},
                {"id": "c", "topic": "sso", "answer": "Yes, SAML."}, {"id": "d", "topic": "sso", "answer": "SSO is on the roadmap."}]
        kinds = {i["kind"] for i in cc.check(rows)}
        self.assertEqual(kinds, {"percent", "yes/no"})
        self.assertEqual(cc.check(rows[:1] + rows[2:3]), [])

if __name__ == "__main__":
    unittest.main()
