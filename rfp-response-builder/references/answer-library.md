# Answer library (answers.jsonl)

One JSON object per line.

```json
{"id": "sec-001", "question": "Do you encrypt customer data at rest?", "answer": "Yes. AES-256 on all stores, keys in a managed KMS with yearly rotation.", "topic": "encryption", "source": "kb/security-whitepaper.pdf#3.2", "owner": "Security", "last_verified": "2026-06-30", "tags": ["SIG", "CAIQ"]}
```

- `source` is required. An answer with no source is not a library answer.
- `last_verified` older than 365 days makes a match amber.
- Keep one answer per fact. Conflicting entries are found by `consistency_check.py`.
