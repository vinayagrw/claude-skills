import csv, json, subprocess, sys, tempfile, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
import score_deals, pilot_tracker
CFG = json.loads((ROOT / "references" / "scoring.json").read_text())
F = list(CFG["fields"])

class T(unittest.TestCase):
    def test_score_and_lanes(self):
        strong = {f: "y" for f in F}; strong["amount"] = "100000"
        weak = {f: "n" for f in F}; weak["amount"] = "900000"
        nopain = dict(strong, pain="n")
        self.assertEqual(score_deals.score(strong, CFG)[:2], (100, 2))
        self.assertEqual(score_deals.score(weak, CFG)[:2], (0, 1))
        self.assertEqual(score_deals.score(nopain, CFG)[1], 1, "lane 2 needs pain")
        self.assertIn("pain", score_deals.score(nopain, CFG)[2])

    def test_40_deals_sorted(self):
        rows = [dict({f: ["y", "partial", "n"][(i + j) % 3] for j, f in enumerate(F)}, deal_id=str(i), amount=str(10000 * (i + 1))) for i in range(40)]
        out = score_deals.run(rows, CFG)
        self.assertEqual(len(out), 40)
        self.assertEqual([r["priority"] for r in out], sorted([r["priority"] for r in out], reverse=True))

    def test_pilot_metrics_and_html(self):
        d = Path(tempfile.mkdtemp()); p = d / "pilot.csv"
        rows = [{"deal_id": str(i), "lane": "2" if i < 6 else "1", "start_date": "2026-10-01", "qualified": "y" if i < 6 or i == 7 else "n",
                 "se_hours": "12" if i < 6 else "0", "demo_date": "2026-10-05", "next_stage_date": "2026-10-09" if i % 2 == 0 else "",
                 "tech_decision_date": f"2026-10-{10+i:02d}" if i < 6 else ""} for i in range(12)]
        with p.open("w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0])); w.writeheader(); w.writerows(rows)
        m = pilot_tracker.metrics(rows)
        self.assertEqual(m["2"]["se_hours_per_qualified"], 12.0)
        self.assertEqual(m["2"]["demo_conversion"], 0.5)
        self.assertEqual(m["2"]["days_to_tech_decision"], 11.5)
        out = d / "t.html"
        subprocess.run([sys.executable, "-I", str(ROOT / "scripts" / "pilot_tracker.py"), str(p), "-o", str(out)], check=True)
        html = out.read_text()
        self.assertNotIn("/*__DATA__*/null", html); self.assertIn('"se_hours_per_qualified"', html)

if __name__ == "__main__":
    unittest.main()
