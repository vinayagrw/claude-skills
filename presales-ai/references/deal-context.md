# deal-context.json

Shared state for the presales suite. One file per deal, in the working folder.

```json
{
  "account": {"name": "Northwind Health", "industry": "Healthcare", "size": "2,400 staff", "region": "US"},
  "buyer": {"persona": "CISO", "champion": "Head of Platform", "guessed": false},
  "competitors": ["Contoso Cloud"],
  "job": "full_deal_pack",
  "inputs": {"questionnaire": "inputs/sig-lite.xlsx", "deals_csv": "inputs/deals.csv", "notes": ["inputs/call-1.md"], "docs": ["inputs/kb/"]},
  "deadline": "2026-10-24",
  "format": ["xlsx", "html"],
  "outputs": {
    "qualification": {"score": 78, "lane": 2, "file": "out/scored-deals.csv"},
    "personas": "out/personas.md",
    "battle_card": "out/battle-card-contoso.html",
    "meeting_prep": "out/brief.html",
    "rfp": {"file": "out/sig-lite-answered.xlsx", "red": 4, "amber": 7, "green": 19}
  }
}
```

Rules: keys are optional except `account.name` and `job`. Each skill only adds to `outputs`
and never deletes another skill's keys.
