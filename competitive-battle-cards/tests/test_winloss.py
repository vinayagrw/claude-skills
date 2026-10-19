import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import winloss

def deals():
    out = []
    for i in range(40):
        poc = "y" if i % 2 == 0 else "n"
        won = (poc == "y" and i % 4 != 2) or i % 10 == 1
        out.append({"deal_id": str(i), "outcome": "won" if won else "lost", "amount": str(20000 + i * 5000), "segment": ["mid", "ent"][i % 3 == 0],
                    "competitor": ["Contoso", "Fabrikam"][i % 2], "lane": "2" if poc == "y" else "1", "cycle_days": str(30 + i * 3),
                    "poc_done": poc, "se_hours": "10", "loss_reason": "" if won else ["price", "no champion"][i % 2]})
    return out

class T(unittest.TestCase):
    def test_report(self):
        r = winloss.analyse(deals())
        self.assertEqual(r["n"], 40)
        poc = [s for s in r["signals"] if s["factor"] == "poc_done"]
        self.assertTrue(poc, "poc_done should be a leading signal")
        self.assertGreaterEqual(abs(poc[0]["lift"]), 0.1)
        md = winloss.render(r)
        self.assertIn("not proof of cause", md); self.assertNotIn("—", md); self.assertNotIn(";", md)

    def test_low_sample_and_empty(self):
        r = winloss.analyse(deals()[:6])
        self.assertTrue(any(t["low_sample"] for t in r["table"]))
        self.assertEqual(winloss.analyse([{"outcome": "open"}])["n"], 0)

if __name__ == "__main__":
    unittest.main()
