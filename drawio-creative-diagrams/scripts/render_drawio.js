#!/usr/bin/env node
/*
 * render_drawio.js — render a .drawio file to a PNG for visual proof.
 *
 * Usage:   node render_drawio.js <in.drawio> <out.png> [pageIndex]
 *          (pageIndex is 0-based; default 0. Count pages: grep -c '<diagram ' file)
 *
 * Setup (one time, in any scratch dir):
 *          npm init -y && npm install puppeteer
 *          npx puppeteer browsers install chrome   # if the postinstall was blocked
 *
 * Why it's written this way (see references/rendering-and-proofing.md):
 *  - injects the official drawio viewer, then calls GraphViewer.processElements()
 *    EXPLICITLY — auto-processing races the DOM and intermittently fails.
 *  - screenshots the <svg> clipped to its bounding box (the wrapper reports 0 height).
 *  - NOTE: the static viewer does NOT render data:image nodes (SVG or PNG) — embedded
 *    brand logos look broken here but are fine in the real draw.io app. Prefer provider
 *    stencils + emoji for anything you need to proof through this pipeline.
 */
const puppeteer = require('puppeteer');
const fs = require('fs');

const [, , inFile, outFile, pageArg] = process.argv;
if (!inFile || !outFile) {
  console.error('Usage: node render_drawio.js <in.drawio> <out.png> [pageIndex]');
  process.exit(1);
}
const pageIndex = pageArg ? parseInt(pageArg, 10) : 0;

(async () => {
  const xml = fs.readFileSync(inFile, 'utf8');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 2600, height: 1800, deviceScaleFactor: 2 });
  await page.setContent(
    '<!DOCTYPE html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#fff}</style></head><body></body></html>',
    { waitUntil: 'load' }
  );
  await page.addScriptTag({ url: 'https://viewer.diagrams.net/js/viewer-static.min.js' });
  if (!(await page.evaluate(() => typeof GraphViewer !== 'undefined'))) {
    console.error('ERR GraphViewer not loaded (network to viewer.diagrams.net?)');
    process.exit(2);
  }
  await page.evaluate((cfg) => {
    const div = document.createElement('div');
    div.className = 'mxgraph';
    div.setAttribute('data-mxgraph', JSON.stringify(cfg));
    document.body.appendChild(div);
    GraphViewer.processElements();
  }, { highlight: '#ffffff', nav: false, resize: true, page: pageIndex, xml });
  await page.waitForSelector('.mxgraph svg', { timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2000));
  const clip = await (await page.$('.mxgraph svg')).boundingBox();
  await page.screenshot({
    path: outFile,
    clip: { x: Math.max(0, clip.x - 4), y: Math.max(0, clip.y - 4), width: clip.width + 8, height: clip.height + 8 },
  });
  await browser.close();
  console.log('OK', outFile, Math.round(clip.width) + 'x' + Math.round(clip.height));
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
