"""Token report from Claude Code transcripts. Usage: insights.py ROOT FROM_MS TO_MS LABEL [text|html OUT]"""
import collections, datetime as dt, glob, html, json, os, sys

PRICE = {'inp': 15, 'cw': 18.75, 'cr': 1.5, 'out': 75}  # USD per million, Opus-tier list prices
KIND = {'cr': 'cache read', 'cw': 'cache write', 'inp': 'uncached in', 'out': 'output'}


def scan(root, start, end):
    seen, rows = set(), []
    ev = dict(prompts=[], compacts=[], errors=[], tools=collections.Counter(), tool_text=collections.Counter())
    for path in glob.glob(os.path.join(root, '*', '**', '*.jsonl'), recursive=True):
        try:
            if os.path.getmtime(path) < start:
                continue
            lines = open(path, errors='ignore')
        except OSError:
            continue
        project = os.path.relpath(path, root).split(os.sep)[0]
        is_sub = f'{os.sep}subagents{os.sep}' in path
        names = {}
        for line in lines:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            m = r.get('message') or {}
            stamp = r.get('timestamp')
            when = dt.datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() if stamp else None
            inside = when is not None and start <= when < end
            content = m.get('content')
            if r.get('type') == 'system' and r.get('subtype') == 'compact_boundary' and inside:
                meta = r.get('compactMetadata') or {}
                ev['compacts'].append(dict(at=when, trigger=meta.get('trigger', '?'), pre=meta.get('preTokens', 0) or 0))
            if r.get('isApiErrorMessage') and inside:
                text = ' '.join(b.get('text', '') for b in content if isinstance(b, dict)) if isinstance(content, list) else str(content)
                ev['errors'].append(dict(at=when, limit='limit' in text.lower(), text=text[:90], key=(project, r.get('sessionId', '?'))))
            if r.get('type') == 'assistant' and isinstance(content, list):
                for b in content:
                    if isinstance(b, dict) and b.get('type') == 'tool_use':
                        names[b.get('id')] = b.get('name', '?')
                        if inside:
                            ev['tools'][b.get('name', '?')] += 1
            if r.get('type') == 'user' and inside and not is_sub and not r.get('isMeta') and not r.get('isCompactSummary'):
                if isinstance(content, str) and not content.startswith('<'):
                    ev['prompts'].append(dict(at=when, project=project, session=r.get('sessionId', '?')))
                elif isinstance(content, list):
                    results = [b for b in content if isinstance(b, dict) and b.get('type') == 'tool_result']
                    for b in results:
                        body = b.get('content')
                        size = len(body) if isinstance(body, str) else sum(len(str(x.get('text', ''))) for x in body or [] if isinstance(x, dict))
                        ev['tool_text'][names.get(b.get('tool_use_id'), '?')] += size // 4
                    if not results and any(isinstance(b, dict) and b.get('type') == 'text' and not str(b.get('text', '')).startswith('<') for b in content):
                        ev['prompts'].append(dict(at=when, project=project, session=r.get('sessionId', '?')))
            u = m.get('usage')
            if r.get('type') != 'assistant' or not u or when is None:
                continue
            at = when
            key = (m.get('id'), r.get('requestId'))
            if not start <= at < end or key in seen:
                continue
            seen.add(key)
            rows.append(dict(at=at, project=project, session=r.get('sessionId', '?'), model=m.get('model', '?'), sub=is_sub or bool(r.get('isSidechain')),
                             inp=u.get('input_tokens', 0) or 0, cw=u.get('cache_creation_input_tokens', 0) or 0,
                             cr=u.get('cache_read_input_tokens', 0) or 0, out=u.get('output_tokens', 0) or 0))
    return rows, ev


total = lambda r: r['inp'] + r['cw'] + r['cr'] + r['out']
cost = lambda r: sum(r[k] * p for k, p in PRICE.items()) / 1e6


def n(x):
    return f'{x / 1e9:.2f}B' if x >= 1e9 else f'{x / 1e6:.1f}M' if x >= 1e6 else f'{x / 1e3:.0f}k' if x >= 1e3 else f'{x:.0f}'


def short(project):
    return project.replace('-Users-vinayagrawal-', '~/').strip('-')[-40:]


def analyse(root, start, end, label):
    span = end - start
    rows, ev = scan(root, start - span, end)
    now = [r for r in rows if r['at'] >= start]
    for key in ('prompts', 'compacts', 'errors'):
        ev[key] = [x for x in ev[key] if x['at'] >= start]
    if not now:
        return None
    prev = sum(total(r) for r in rows if r['at'] < start)
    sums = {k: sum(r[k] for r in now) for k in PRICE}
    tokens = sum(sums.values())
    sessions = collections.defaultdict(list)
    for r in now:
        sessions[(r['project'], r['session'])].append(r)

    days = collections.defaultdict(lambda: [0, 0])
    for r in now:
        day = dt.datetime.fromtimestamp(r['at']).strftime('%Y-%m-%d')
        days[day][0 if len(sessions[(r['project'], r['session'])]) <= 2 else 1] += total(r)

    def ranked(key):
        c = collections.Counter()
        for r in now:
            c[key(r)] += total(r)
        return c.most_common(6)

    heavy = []
    for (project, sid), rs in sorted(sessions.items(), key=lambda kv: -sum(map(total, kv[1])))[:5]:
        heavy.append(dict(id=sid[:8], project=short(project), calls=len(rs), tokens=sum(map(total, rs)),
                          ctx=sum(r['inp'] + r['cw'] + r['cr'] for r in rs) / len(rs)))

    noise = collections.defaultdict(lambda: [0, 0])
    for (project, _), rs in sessions.items():
        if len(rs) <= 2:
            noise[project][0] += 1
            noise[project][1] += sum(map(total, rs))
    noise_tokens = sum(t for c, t in noise.values())

    # Cold restarts: a call more than an hour after the previous one in the same session.
    cold = []
    for rs in sessions.values():
        rs.sort(key=lambda r: r['at'])
        cold += [b for a, b in zip(rs, rs[1:]) if b['at'] - a['at'] > 3600]
    cold_tokens = sum(r['cw'] for r in cold)
    inputs = sums['cr'] + sums['cw'] + sums['inp']
    hit = sums['cr'] / inputs if inputs else 0
    sub = sum(total(r) for r in now if r['sub'])
    heat = [[0] * 24 for _ in range(7)]
    for r in now:
        at = dt.datetime.fromtimestamp(r['at'])
        heat[at.weekday()][at.hour] += total(r)
    noisy_hours = collections.Counter()
    for r in now:
        if len(sessions[(r['project'], r['session'])]) <= 2:
            noisy_hours[dt.datetime.fromtimestamp(r['at']).hour] += total(r)
    usd_projects = collections.Counter()
    for r in now:
        usd_projects[short(r['project'])] += cost(r)
    short_opus = [r for r in now if 'opus' in r['model'] and r['out'] < 500 and not r['sub']]
    main_calls = [r for r in now if not r['sub'] and len(sessions[(r['project'], r['session'])]) > 2]
    real = lambda key: len(sessions.get(key, ())) > 2
    prompts = sum(real((p['project'], p['session'])) for p in ev['prompts'])
    ev['noise_errors'] = [x for x in ev['errors'] if not real(x['key'])]
    ev['errors'] = [x for x in ev['errors'] if real(x['key'])]
    extra = dict(hit=hit, cold=len(cold), cold_tokens=cold_tokens, sub=sub, heat=heat, compacts=ev['compacts'],
                 errors=ev['errors'], noise_errors=len(ev['noise_errors']), tools=ev['tools'].most_common(8), tool_text=ev['tool_text'].most_common(6),
                 prompts=prompts, fanout=len(main_calls) / prompts if prompts else 0,
                 usd_projects=usd_projects.most_common(5), skills=sorted(t for t in ev['tools'] if t == 'Skill'),
                 mcp=collections.Counter(t.split('__')[1] for t in ev['tools'].elements() if t.startswith('mcp__')).most_common(6))

    tips = []  # (level, title, detail)
    for project, (count, t) in sorted(noise.items(), key=lambda kv: -kv[1][1]):
        if count >= 20 and t / tokens >= 0.05:
            tips.append(('bad', f'{t / tokens:.0%} is automated noise',
                         f'{count:,} one-shot sessions in {short(project)} burned {n(t)}. Stop the scheduled task or keep-alive.'))
    if sums['cw'] / tokens > 0.15:
        tips.append(('warn', f'{sums["cw"] / tokens:.0%} spent re-writing cache',
                     f'~${sums["cw"] * PRICE["cw"] / 1e6:,.0f} of cache writes. /compact before long breaks.'))
    for s in heavy:
        if s['calls'] > 10 and s['ctx'] > 200_000:
            tips.append(('warn', f'Session {s["id"]} is bloated',
                         f'~{n(s["ctx"])} context on each of {s["calls"]} calls. /compact earlier.'))
    if cold and cold_tokens / tokens > 0.02:
        tips.append(('warn', f'{len(cold)} cold restarts', f'Coming back after an hour idle re-wrote {n(cold_tokens)} (~${cold_tokens * PRICE["cw"] / 1e6:,.0f}).'))
    if ev['compacts']:
        avg = sum(c['pre'] for c in ev['compacts']) / len(ev['compacts'])
        manual = sum(c['trigger'] == 'manual' for c in ev['compacts'])
        if avg > 180_000:
            tips.append(('warn', f'Compacting late (avg {n(avg)})', f'{len(ev["compacts"])} compactions, {manual} manual. Compacting near 150k cuts every later call.'))
    total_text = sum(ev['tool_text'].values())
    if total_text and ev['tool_text'].most_common(1)[0][1] / total_text > 0.4:
        name, size = ev['tool_text'].most_common(1)[0]
        tips.append(('warn', f'{name} fills the context', f'{size / total_text:.0%} of tool output (~{n(size)}). Read ranges, filter Bash output.'))
    if noise_tokens and noisy_hours:
        hour = noisy_hours.most_common(1)[0][0]
        tips.append(('bad', f'Automated runs peak at {hour:02d}:00', 'Check cron, launchd, scheduled tasks or a keep-alive around that time.'))
    if len(short_opus) > 50 and len(short_opus) / max(1, len(now)) > 0.3:
        tips.append(('ok', f'{len(short_opus):,} short Opus replies', 'Calls with under 500 output tokens; Sonnet or Haiku would handle many for less.'))
    limits = [x for x in ev['errors'] if x['limit']]
    if limits:
        tips.append(('bad', f'Hit a limit {len(limits)} time(s) in real work', 'Watch the usage band; it warns at 80% and 95%.'))
    if ev['noise_errors']:
        tips.append(('bad', f'The automated loop failed {len(ev["noise_errors"]):,} times', 'It keeps firing even when it hits limits or errors.'))
    if prev:
        change = (tokens - prev) / prev
        tips.append(('bad' if change > 0.5 else 'ok', f'{change:+.0%} vs previous period', f'{n(prev)} → {n(tokens)}'))

    return dict(label=label, tokens=tokens, calls=len(now), sessions=len(sessions), usd=sum(map(cost, now)),
                sums=sums, noise=noise_tokens, days=sorted(days.items()), projects=ranked(lambda r: short(r['project'])),
                models=ranked(lambda r: r['model']), heavy=heavy, tips=tips, **extra)


def bar(value, top, width=20):
    return '█' * max(1, round(value / top * width)) if top else ''


def text(d):
    icon = {'bad': '🔴', 'warn': '🟠', 'ok': '🟢'}
    work = d['tokens'] - d['noise']
    out = [f'📊 Token insights · {d["label"]}', '',
           f'  {n(d["tokens"])} tokens   ~${d["usd"]:,.0f}   {d["calls"]:,} calls   {d["sessions"]:,} sessions',
           f'  real work {n(work)} ({work / d["tokens"]:.0%})  ·  automated {n(d["noise"])} ({d["noise"] / d["tokens"]:.0%})', '']
    out.append(f'  cache hit {d["hit"]:.0%}  ·  {d["prompts"]} prompts → {d["fanout"]:.1f} calls each  ·  subagents {n(d["sub"])}'
               f'  ·  {len(d["compacts"])} compactions  ·  {len(d["errors"])} errors')
    out.append('')
    if d['tips']:
        out.append('What matters')
        out.extend(f'  {icon[level]} {title}: {detail}' for level, title, detail in d['tips'])
        out.append('')
    top = max(v for _, v in d['projects'])
    out.append('Where it went')
    out.extend(f'  {bar(v, top):<20} {n(v):>7}  {k}' for k, v in d['projects'][:5])
    if len(d['days']) > 1:
        top = max(sum(v) for _, v in d['days'])
        out += ['', 'By day  (░ automated  █ real work)']
        for day, (auto, real) in d['days']:
            name = dt.date.fromisoformat(day).strftime('%a %d')
            out.append(f'  {name}  {"░" * round(auto / top * 20)}{"█" * round(real / top * 20):<{20 - round(auto / top * 20)}} {n(auto + real):>7}')
    if d['tools']:
        out += ['', 'Tools  (calls · output into context)']
        text_by = dict(d['tool_text'])
        out.extend(f'  {c:>6}×  {k[:38]:<38} {n(text_by.get(k, 0)):>7}' for k, c in d['tools'][:6])
    out += ['', 'Heaviest sessions']
    out.extend(f'  {n(s["tokens"]):>7}  {s["id"]}  {s["calls"]} calls · ~{n(s["ctx"])}/call · {s["project"]}' for s in d['heavy'][:3])
    out += ['', '  /insights week html  opens the visual dashboard']
    return '\n'.join(out)


def page(d):
    e = html.escape
    work = d['tokens'] - d['noise']
    top_day = max((sum(v) for _, v in d['days']), default=1)
    top_proj = max((v for _, v in d['projects']), default=1)
    days = ''.join(
        f'<div class="col" title="{e(day)}: {n(a + r)}"><div class="stack" style="height:{(a + r) / top_day * 100:.1f}%">'
        f'<i class="auto" style="flex:{a}"></i><i class="real" style="flex:{r}"></i></div>'
        f'<span>{dt.date.fromisoformat(day).strftime("%a %d")}</span><b>{n(a + r)}</b></div>' for day, (a, r) in d['days'])
    projects = ''.join(f'<li><span>{e(k)}</span><i style="width:{v / top_proj * 100:.1f}%"></i><b>{n(v)}</b></li>' for k, v in d['projects'])
    tips = ''.join(f'<div class="tip {lv}"><strong>{e(t)}</strong><p>{e(x)}</p></div>' for lv, t, x in d['tips'])
    kinds = ''.join(f'<i class="k{k}" style="flex:{d["sums"][k]}" title="{KIND[k]} {n(d["sums"][k])}"></i>' for k in KIND)
    legend = ''.join(f'<span><i class="k{k}"></i>{KIND[k]} {n(d["sums"][k])}</span>' for k in KIND)
    heavy = ''.join(f'<tr><td>{e(s["id"])}</td><td>{e(s["project"])}</td><td>{s["calls"]}</td><td>{n(s["ctx"])}</td><td>{n(s["tokens"])}</td></tr>' for s in d['heavy'])
    stats = ''.join(f'<div class="kpi"><b>{v}</b><span>{e(k)}</span></div>' for k, v in [
        ('cache hit rate', f'{d["hit"]:.0%}'), ('your prompts', d['prompts']), ('calls per prompt', f'{d["fanout"]:.1f}'),
        ('subagent tokens', n(d['sub'])), ('cold restarts', d['cold']), ('compactions', len(d['compacts'])), ('errors', len(d['errors']))])
    hot = max(max(row) for row in d['heat']) or 1
    heat = ''.join(f'<div class="hrow"><span>{["Mon","Tue","Wed","Thu","Fri","Sat","Sun"][i]}</span>' + ''.join(
        f'<i title="{h:02d}:00 {n(v)}" style="opacity:{0.08 + 0.92 * (v / hot) ** 0.5:.2f}"></i>' for h, v in enumerate(row)) + '</div>'
        for i, row in enumerate(d['heat']))
    heat += '<div class="hrow"><span></span>' + ''.join(f'<em>{h if h % 6 == 0 else ""}</em>' for h in range(24)) + '</div>'
    text_by = dict(d['tool_text'])
    top_tool = max((c for _, c in d['tools']), default=1)
    tools = ''.join(f'<li><span>{e(k)}</span><i style="width:{c / top_tool * 100:.1f}%"></i><b>{c}× · {n(text_by.get(k, 0))}</b></li>' for k, c in d['tools'])
    top_usd = max((v for _, v in d['usd_projects']), default=1)
    usd = ''.join(f'<li><span>{e(k)}</span><i class="money" style="width:{v / top_usd * 100:.1f}%"></i><b>${v:,.0f}</b></li>' for k, v in d['usd_projects'])
    comp = ''.join(f'<tr><td>{dt.datetime.fromtimestamp(c["at"]).strftime("%a %H:%M")}</td><td>{e(c["trigger"])}</td><td>{n(c["pre"])}</td></tr>' for c in d['compacts'][-8:])
    mcp = ''.join(f'<span>{e(k)} <b>{v}</b></span>' for k, v in d['mcp']) or '<span>none</span>'
    models = ''.join(f'<span>{e(k)} <b>{n(v)}</b></span>' for k, v in d['models'] if v)
    return f'''<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Token Insights</title><style>
:root{{--bg:#f6f5f1;--card:#fff;--ink:#1d1d1b;--dim:#6b6a65;--line:#e4e2dc;--real:#3b6fd8;--auto:#e0a03a;--bad:#d14b3c;--warn:#e0a03a;--ok:#2f9e6a}}
@media (prefers-color-scheme:dark){{:root{{--bg:#151514;--card:#1f1f1d;--ink:#eceae4;--dim:#9a988f;--line:#33322f;--real:#6d97ee}}}}
*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 -apple-system,system-ui,sans-serif;padding:28px 16px}}
main{{max-width:1080px;margin:auto;display:grid;gap:16px}}h1{{margin:0;font-size:22px}}h2{{margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim)}}
.card{{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:18px}}
.kpis{{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}}.kpi b{{display:block;font-size:30px;font-weight:700}}.kpi span{{color:var(--dim);font-size:13px}}
.split{{display:flex;height:14px;border-radius:7px;overflow:hidden;margin:10px 0 6px}}.split i{{display:block}}
.real,.split .r{{background:var(--real)}}.auto,.split .a{{background:var(--auto)}}
.kcr{{background:#3b6fd8}}.kcw{{background:#e0a03a}}.kinp{{background:#8a8780}}.kout{{background:#2f9e6a}}
.legend{{display:flex;flex-wrap:wrap;gap:14px;font-size:13px;color:var(--dim)}}.legend i{{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px}}
.tips{{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}}.tip{{border-left:5px solid var(--ok);padding:10px 14px;background:var(--bg);border-radius:8px}}
.tip.bad{{border-color:var(--bad)}}.tip.warn{{border-color:var(--warn)}}.tip p{{margin:4px 0 0;color:var(--dim);font-size:14px}}
.days{{display:flex;align-items:flex-end;gap:10px;height:220px;overflow-x:auto}}.col{{flex:1;min-width:44px;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;font-size:12px;color:var(--dim)}}
.stack{{width:100%;display:flex;flex-direction:column;border-radius:6px 6px 0 0;overflow:hidden;min-height:3px}}.stack i{{display:block}}.col b{{color:var(--ink)}}
ul{{list-style:none;margin:0;padding:0;display:grid;gap:8px}}li{{display:grid;grid-template-columns:minmax(120px,280px) 1fr 70px;gap:10px;align-items:center;font-size:14px}}
li span{{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}li i{{display:block;height:12px;border-radius:6px;background:var(--real)}}li b{{text-align:right}}
table{{width:100%;border-collapse:collapse;font-size:14px}}td,th{{text-align:left;padding:7px 6px;border-bottom:1px solid var(--line)}}th{{color:var(--dim);font-weight:500}}
.hrow{{display:grid;grid-template-columns:36px repeat(24,1fr);gap:3px;margin-bottom:3px;font-size:11px;color:var(--dim)}}
.hrow i{{display:block;height:18px;border-radius:3px;background:var(--real)}}.hrow em{{font-style:normal}}li i.money{{background:var(--ok)}}
.grid2{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}}.models span{{display:inline-block;margin:0 16px 6px 0}}
</style></head><body><main>
<h1>📊 Token insights · {e(d["label"])}</h1>
<section class="card kpis">
<div class="kpi"><b>{n(d["tokens"])}</b><span>tokens</span></div><div class="kpi"><b>${d["usd"]:,.0f}</b><span>at list price</span></div>
<div class="kpi"><b>{d["calls"]:,}</b><span>API calls</span></div><div class="kpi"><b>{d["sessions"]:,}</b><span>sessions</span></div>
<div class="kpi"><b>{work / d["tokens"]:.0%}</b><span>real work ({n(work)})</span></div></section>
<section class="card kpis">{stats}</section>
<section class="card"><h2>What matters</h2><div class="tips">{tips or "<p>Nothing unusual.</p>"}</div></section>
<section class="card"><h2>Real work vs automated</h2><div class="split"><i class="r" style="flex:{work}"></i><i class="a" style="flex:{d["noise"]}"></i></div>
<div class="legend"><span><i class="real"></i>real work {n(work)}</span><span><i class="auto"></i>automated one-shot sessions {n(d["noise"])}</span></div>
<h2 style="margin-top:18px">Token types</h2><div class="split">{kinds}</div><div class="legend">{legend}</div></section>
{f'<section class="card"><h2>By day</h2><div class="days">{days}</div></section>' if len(d["days"]) > 1 else ''}
<div class="grid2"><section class="card"><h2>Where it went</h2><ul>{projects}</ul><h2 style="margin-top:18px">Models</h2><div class="models">{models}</div></section>
<section class="card"><h2>When tokens are spent (hour of day)</h2>{heat}</section>
<section class="card"><h2>Tools · calls and output into context</h2><ul>{tools or "<p>No tool calls.</p>"}</ul>
<h2 style="margin-top:18px">MCP servers used</h2><div class="models">{mcp}</div></section></div>
<div class="grid2"><section class="card"><h2>Cost by project</h2><ul>{usd}</ul></section>
<section class="card"><h2>Compactions</h2><table><tr><th>When</th><th>Trigger</th><th>Size before</th></tr>{comp or "<tr><td colspan=3>None</td></tr>"}</table></section></div>
<div class="grid2"><section class="card"><h2>Heaviest sessions</h2><table><tr><th>Session</th><th>Project</th><th>Calls</th><th>Ctx/call</th><th>Total</th></tr>{heavy}</table></section>
</main></body></html>'''


if __name__ == '__main__':
    root, start, end, label = sys.argv[1], int(sys.argv[2]) / 1000, int(sys.argv[3]) / 1000, sys.argv[4]
    mode = sys.argv[5] if len(sys.argv) > 5 else 'text'
    d = analyse(os.path.expanduser(root), start, end, label)
    if d is None:
        print(f'Token insights, {label}: no API calls found.')
    elif mode == 'html':
        out = os.path.expanduser(sys.argv[6])
        os.makedirs(os.path.dirname(out), exist_ok=True)
        open(out, 'w').write(page(d))
        print(f'Dashboard written to {out}')
    else:
        print(text(d))
