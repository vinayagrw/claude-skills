# Confluence paste-safety + ASCII diagram cookbook

This is the hard-won knowledge for making a Markdown TDR paste cleanly into Confluence Cloud. Apply it to the `-confluence.md` copy. The Mermaid master (`-design.md`) keeps real Mermaid and can ignore most of this.

## The three things that break a Markdown paste

Confluence Cloud auto-converts pasted Markdown (Editor → paste → "Paste as Markdown"). Most things convert fine. These three do not:

### 1. Tables inside blockquotes — DO NOT
A table whose rows are prefixed with `>` is treated as quoted text, not a table, and renders as a broken run of pipes.

Wrong:
```
> 💡 Here is the mapping:
>
> | A | B |
> |---|---|
> | x | y |
```

Right — keep the callout text quoted, pull the table to top level:
```
> 💡 Here is the mapping:

| A | B |
|---|---|
| x | y |
```

### 2. `<details>` / `<summary>` — DO NOT
Confluence renders the raw HTML or strips it. Replace the collapsible with a plain bold label and the content inline.

Wrong:
```
<details>
<summary><b>Transcript</b></summary>

```
...
```
</details>
```

Right:
```
**Transcript — what happens today:**

```
...
```
```

### 3. Mermaid blocks — DO NOT (in the paste copy)
A ` ```mermaid ` fence pastes as its source text, not a rendered diagram. In the `-confluence.md` copy, replace every Mermaid block with an ASCII diagram in a plain code block (see cookbook below). (The `-design.md` master keeps Mermaid so it renders on GitHub.)

## What pastes fine (use freely)
Top-level tables, fenced code blocks (incl. ASCII diagrams and JSON), blockquote *text* (no tables/code inside), headings, bold/italic, emoji, bullet/numbered lists, inline code.

## Other paste tips
- Status: emoji + backticked word (`🟢 \`DECIDED\``) survives paste. After pasting you can swap to the native Status macro if you like.
- Page properties: a top-level table; optionally convert to the Page Properties macro post-paste.
- Keep ASCII diagrams in code blocks so the monospace alignment holds — pasted as normal text they skew.

## Lint
After writing the paste copy, run the bundled linter, which flags all three breakers with line numbers:
```
python <skill-dir>/scripts/paste_safety_lint.py <path-to-confluence.md>
```

---

# ASCII diagram cookbook

Author the diagram in Mermaid in the master, then hand-translate to one of these shapes. Keep diagrams small — if it needs more than ~10 boxes, split it. Use spaces (never tabs) so alignment holds in a code block.

## Linear pipeline
```
[ trigger ] --> [ persona ] --> [ action ] --> [ end ]
  inbound        AI agent       send email
```

## Branch (decision)
```
            Connection exists?
             |            |
            yes          no
             v            v
        Wire it      Connect now or later?
                      |            |
                     now         later
                      v            v
                 OAuth popup   mark pending
```

## Fan-in / converge
```
 [Talk to Recruiter] --persona--+
                                +--> POST /start --> { select by target }
 [Build with Izzy]   --workflow-+
```

## Loop-back (e.g. validate → repair)
```
 Invoke --> Parse --> Validate
   ^                    |
   |              ok ---+--- fail
   |              |          |
   |              v          v
   |           Persist   attempts < N ?
   |                      |          |
   |                     yes        no
   +-- re-invoke w/ errors+          v
                                  Give up / partial
```

## Sequence as numbered lanes (replaces a Mermaid sequenceDiagram)
A sequence diagram doesn't translate to boxes well. Use a labelled, numbered step list instead — it reads clearly and pastes perfectly.
```
Lanes:  User -> Panel -> core-api -> Bedrock -> DB

1.  User    : clicks start
2.  Panel   -> core-api : POST /start
3.  loop (questions):
       core-api -> Panel : next question
       User     -> Panel : answer
       Panel    -> core-api : POST /message
4.  core-api -> Bedrock : finalize (strict schema)
5.  Bedrock  -> core-api : structured payload
6.  core-api -> DB : persist (draft)
7.  core-api -> Panel : { id, redirectTo }
```

## Layered architecture box
```
+-----------------------------------------------+
| Engine (shared, BE)                           |
|   Schema --> Policy --> Extractor --+          |
|     ^                               |          |
|     +-------------------------------+          |
|              |                                 |
|     all filled v                               |
|            Finalize --> payload                |
+-----------------------------------------------+
```

Arrow glyphs that paste safely: `-->`, `->`, `<--`, `^`, `v`, `|`, `+`, `<->`. Avoid box-drawing unicode if you want maximum portability, though `┌ ─ ┐ │ └ ┘` work in most Confluence fonts inside a code block.
