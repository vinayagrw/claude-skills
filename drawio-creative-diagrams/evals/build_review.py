#!/usr/bin/env python3
"""Build a self-contained HTML review page that RENDERS each .drawio output using
draw.io's own viewer library (viewer.diagrams.net), side-by-side with-skill vs
baseline, with grades, tokens/time, and a per-diagram feedback box that exports
feedback.json. This is what lets a human judge the *visual* quality a creativity
skill is really about — the generic eval viewer can't render .drawio."""
import json, os, glob, html

WSROOT = r"C:\Users\viagr\.claude\skills\drawio-creative-diagrams-workspace"
WITH_DIR = os.path.join(WSROOT, "iteration-2")   # latest improved skill
BASE_DIR = os.path.join(WSROOT, "iteration-1")   # baseline lives here
WS = BASE_DIR
EVALS = json.load(open(os.path.join(os.path.dirname(__file__), "evals.json"), encoding="utf-8"))["evals"]


def read(path):
    try:
        return open(path, encoding="utf-8").read()
    except Exception:
        return None


def run_data(eval_id, cfg):
    base = WITH_DIR if cfg == "with_skill" else BASE_DIR
    run = os.path.join(base, eval_id, cfg)
    files = glob.glob(os.path.join(run, "outputs", "*.drawio"))
    xml = read(files[0]) if files else None
    grading = read(os.path.join(run, "grading.json"))
    timing = read(os.path.join(run, "timing.json"))
    return {
        "xml": xml,
        "grading": json.loads(grading) if grading else None,
        "timing": json.loads(timing) if timing else None,
    }


def viewer_div(xml):
    if not xml:
        return "<div class='missing'>no .drawio produced</div>"
    cfg = {"highlight": "#1a56c4", "nav": True, "resize": True,
           "toolbar": "zoom layers", "xml": xml}
    data = html.escape(json.dumps(cfg), quote=True)
    return f"<div class='mxgraph' style='max-width:100%;border:1px solid #d3dae3' data-mxgraph=\"{data}\"></div>"


def grade_html(g):
    if not g:
        return ""
    rows = "".join(
        f"<li class='{'p' if e['passed'] else 'f'}'>"
        f"{'✓' if e['passed'] else '✗'} {html.escape(e['text'])} "
        f"<span class='ev'>{html.escape(str(e['evidence']))}</span></li>"
        for e in g["expectations"])
    return f"<div class='grade'><b>{g['passed']}/{g['total']} checks</b><ul>{rows}</ul></div>"


def timing_html(t):
    if not t:
        return ""
    return f"<span class='timing'>{t['total_tokens']:,} tokens · {t['total_duration_seconds']}s</span>"


def main():
    blocks = []
    for ev in EVALS:
        eid = f"eval-{ev['id']}"
        ws = run_data(eid, "with_skill")
        wo = run_data(eid, "without_skill")
        blocks.append(f"""
        <section class="eval">
          <h2>{eid} · {html.escape(ev['name'])}</h2>
          <details><summary>prompt</summary><pre>{html.escape(ev['prompt'])}</pre></details>
          <div class="cols">
            <div class="col">
              <h3>WITH skill · iteration 2 {timing_html(ws['timing'])}</h3>
              {viewer_div(ws['xml'])}
              {grade_html(ws['grading'])}
              <label>Feedback</label>
              <textarea data-run="{eid}-with_skill"></textarea>
            </div>
            <div class="col">
              <h3>BASELINE (no skill) {timing_html(wo['timing'])}</h3>
              {viewer_div(wo['xml'])}
              {grade_html(wo['grading'])}
              <label>Feedback</label>
              <textarea data-run="{eid}-without_skill"></textarea>
            </div>
          </div>
        </section>""")

    page = f"""<!doctype html><html><head><meta charset="utf-8">
<title>drawio-creative-diagrams · review</title>
<style>
 body{{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;background:#f6f8fb;color:#1b2a4a}}
 header{{background:#16294a;color:#fff;padding:16px 24px}}
 header h1{{margin:0;font-size:18px}} header p{{margin:4px 0 0;color:#afc6f0;font-size:13px}}
 .eval{{background:#fff;margin:18px;border:1px solid #d3dae3;border-radius:10px;padding:16px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06)}}
 .eval h2{{margin:0 0 8px;font-size:16px}}
 details{{margin-bottom:12px}} summary{{cursor:pointer;color:#5a6b80}} pre{{white-space:pre-wrap;background:#f0f5ff;padding:10px;border-radius:6px;font-size:12px}}
 .cols{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
 .col h3{{margin:0 0 8px;font-size:13px;color:#0b2e6b}}
 .timing{{font-weight:normal;color:#5a6b80;font-size:12px;margin-left:6px}}
 .grade{{margin:10px 0;font-size:12px}} .grade ul{{list-style:none;padding:0;margin:6px 0}}
 .grade li{{padding:2px 0}} .grade li.p{{color:#0e7a4a}} .grade li.f{{color:#b85450}}
 .ev{{color:#8a97a8;font-size:11px}}
 textarea{{width:100%;min-height:60px;border:1px solid #c9d4e3;border-radius:6px;padding:8px;font:inherit;box-sizing:border-box}}
 label{{font-size:12px;color:#5a6b80}}
 .missing{{padding:30px;text-align:center;color:#b85450;border:1px dashed #e0a0a0;border-radius:6px}}
 .bar{{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #d3dae3;padding:10px 24px;display:flex;gap:12px;align-items:center}}
 button{{background:#1a56c4;color:#fff;border:0;border-radius:6px;padding:8px 14px;cursor:pointer;font:inherit}}
</style></head><body>
<header><h1>drawio-creative-diagrams — iteration 1 review</h1>
<p>Each diagram is rendered live by draw.io's viewer. Compare WITH-skill vs BASELINE, type feedback, then Download.</p></header>
<div class="bar"><button onclick="dl()">⬇ Download feedback.json</button>
<span id="msg" style="color:#5a6b80;font-size:12px"></span></div>
{''.join(blocks)}
<script type="text/javascript" src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
<script>
function dl(){{
  const reviews=[...document.querySelectorAll('textarea')].map(t=>({{run_id:t.dataset.run,feedback:t.value}}));
  const blob=new Blob([JSON.stringify({{reviews,status:'complete'}},null,2)],{{type:'application/json'}});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='feedback.json';a.click();
  document.getElementById('msg').textContent='saved feedback.json to your Downloads';
}}
</script></body></html>"""
    out = os.path.join(WS, "review.html")
    with open(out, "w", encoding="utf-8") as f:
        f.write(page)
    print(out)


if __name__ == "__main__":
    main()
