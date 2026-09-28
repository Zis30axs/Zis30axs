#!/usr/bin/env node
// Renders index.html headlessly and saves the looping GIF using the page's own
// encoder (the same code behind the "导出 GIF" button).
//
//   node scripts/export-gif.cjs [out.gif] [--dark] [--fps=25] [--size=500]
//
// Needs Playwright with Chromium (`npm i -D playwright && npx playwright install chromium`).
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const flag = (name, dflt) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : dflt;
};
const out = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'clawd-to-claude.gif'));
const page = path.join(__dirname, '..', 'index.html');

(async () => {
  const browser = await chromium.launch();
  try {
    const tab = await browser.newPage({ colorScheme: args.includes('--dark') ? 'dark' : 'light' });
    await tab.goto('file://' + page);
    await tab.waitForFunction(() => window.ClawdAnim);
    const b64 = await tab.evaluate(async ({ fps, size }) => {
      const blob = await window.ClawdAnim.exportGif({ fps, size });
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, { fps: flag('fps', 25), size: flag('size', 500) });
    fs.writeFileSync(out, Buffer.from(b64, 'base64'));
    console.log(`wrote ${path.relative(process.cwd(), out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
  } finally {
    await browser.close();
  }
})();
