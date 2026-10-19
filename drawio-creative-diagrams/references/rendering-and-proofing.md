# Rendering a .drawio to PNG for visual proof

`validate_drawio.py` proves the file is **well-formed** and free of overlap/contrast bugs.
It says nothing about whether the diagram actually *looks right* — icon sizing, caption
wrapping, badge placement, zone crowding, whether a real service icon renders a glyph or a
**blank square**, whether the composition reads. The only way to know is to **render it to
an image and look at it**. Do this before delivering anything where appearance matters
(icon-forward diagrams especially, and any dense/infra picture).

draw.io has no reliable headless CLI on a typical machine (no `drawio` binary, the desktop
app may be absent). Render with **Puppeteer driving the official draw.io viewer** instead —
it needs only Node + a one-time Chromium download.

## One-time setup

```bash
cd <a-scratch-dir>
npm init -y
npm install puppeteer
npx puppeteer browsers install chrome    # if npm blocked the postinstall download
```

## Render

`scripts/render_drawio.js` (bundled) — usage:
```bash
node scripts/render_drawio.js <in.drawio> <out.png> [pageIndex]
```
`pageIndex` is 0-based for multi-page files; count pages with `grep -c '<diagram ' file.drawio`
and render each. Then open the PNG (Read it) and inspect.

**Why the script is written the way it is (don't "simplify" these):**
- It injects `viewer-static.min.js` via `addScriptTag`, then calls
  `GraphViewer.processElements()` **explicitly**. The viewer's auto-processing races the DOM
  and **intermittently fails** (`.mxgraph svg` never appears) — the explicit call is
  deterministic.
- It screenshots the rendered **`<svg>` clipped to its bounding box**, not the wrapper div
  (the wrapper reports 0 height) and not the whole page (you'd get whitespace).
- `resize:true` in the config is what makes the viewer lay the SVG out at natural size.

## The proof loop

render → open the PNG → fix (icon size, caption wrap, spacing, zone bounds, a blank-glyph
`resIcon`) → re-render. For a set of diagrams, render them all into a `before/` and
`after/` folder so you (and the user) can compare — this is how you show a redesign landed.

## Limitation: the static viewer does NOT render `data:` image nodes

The embeddable viewer (`viewer-static.min.js`) **will not render `data:image/...` nodes** —
SVG *or* PNG — even a valid one. It shows a broken-image placeholder. The **same data-URI
renders fine in the full draw.io app / editor / Confluence plugin**; it's a limitation of
the lightweight viewer this proof pipeline uses. Consequences:

- You **cannot visually verify an embedded brand logo** through this pipeline — it will look
  broken in the PNG but be fine for the user in real draw.io. Don't "fix" a logo that only
  looks broken in the proof.
- For any diagram you need to **proof**, prefer icon vocabulary the viewer *does* render:
  **provider stencils** (`mxgraph.aws4.*` etc. — vector shapes) and **emoji** both render.
  Reserve embedded `data:` logos for when proofing isn't required, or accept you'll verify
  them by opening the file in real draw.io.
- Aside: `fetch_logo.py`'s Python `urllib` may fail with `SSL: CERTIFICATE_VERIFY_FAILED`
  in some sandboxes; `curl "https://cdn.simpleicons.org/<slug>/<hex>"` usually succeeds — but
  the fetched logo still won't show in this static viewer (above), so this only helps if
  you're embedding for real draw.io, not for a PNG proof.

## render_drawio.js (reference copy — the bundled script is authoritative)

```js
const puppeteer = require('puppeteer');
const fs = require('fs');
const [,, inFile, outFile, pageArg] = process.argv;
const pageIndex = pageArg ? parseInt(pageArg, 10) : 0;
(async () => {
  const xml = fs.readFileSync(inFile, 'utf8');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 2600, height: 1800, deviceScaleFactor: 2 });
  await page.setContent('<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body></body></html>', { waitUntil: 'load' });
  await page.addScriptTag({ url: 'https://viewer.diagrams.net/js/viewer-static.min.js' });
  if (!(await page.evaluate(() => typeof GraphViewer !== 'undefined'))) { console.error('ERR GraphViewer not loaded'); process.exit(2); }
  await page.evaluate((cfg) => {
    const div = document.createElement('div');
    div.className = 'mxgraph';
    div.setAttribute('data-mxgraph', JSON.stringify(cfg));
    document.body.appendChild(div);
    GraphViewer.processElements();
  }, { highlight: '#ffffff', nav: false, resize: true, page: pageIndex, xml });
  await page.waitForSelector('.mxgraph svg', { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const clip = await (await page.$('.mxgraph svg')).boundingBox();
  await page.screenshot({ path: outFile, clip: { x: Math.max(0, clip.x - 4), y: Math.max(0, clip.y - 4), width: clip.width + 8, height: clip.height + 8 } });
  await browser.close();
  console.log('OK', outFile, Math.round(clip.width) + 'x' + Math.round(clip.height));
})().catch(e => { console.error('ERR', e.message); process.exit(1); });
```
