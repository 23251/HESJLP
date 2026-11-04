// How to run: 1) npm i playwright axe-core   2) python3 -m http.server 8123 --directory <repo> &
// 3) node run-checks.js [baseUrl=http://localhost:8123] [outFile=./results.json]   (add SHOTS=1 to also write screenshots next to this script)
const { chromium } = require('playwright');
const axeSrc = require('fs').readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const axeVer = require('axe-core/package.json').version;
const fs = require('fs'), path = require('path');
const BASE = process.argv[2] || 'http://localhost:8123';
const OUT = process.argv[3] || path.join(__dirname, 'results.json');
const PAGES = ['index', 'keep-your-medicaid', 'get-care', 'clinics', 'who-to-call', 'about'];
const THEMES = ['green', 'civic', 'warm'];
const SKIP = () => localStorage.setItem('hesjlp-visitor', '{"role":"skip","at":"x"}');
const R = { axeVersion: axeVer, axe: [], overflow: [], tap: [], keyboard: [], shots: [] };
const url = (p, t, extra) => `${BASE}/${p}.html?theme=${t}${extra || ''}`;

async function ctx(browser, w, h, skip) {
  const c = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  if (skip) await c.addInitScript(SKIP);
  return c;
}
async function runAxe(page, label, theme) {
  await page.evaluate(axeSrc);
  const res = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  for (const v of res.violations) for (const n of v.nodes)
    R.axe.push({ theme, label, rule: v.id, impact: v.impact, selector: n.target.join(' '), summary: (n.failureSummary || '').split('\n').slice(0, 2).join(' ') });
  R.axe.push({ theme, label, count: res.violations.length, isCount: true });
}
(async () => {
  const browser = await chromium.launch();
  R.chromium = browser.version();
  // 1. axe
  for (const t of THEMES) for (const w of [375, 1280]) {
    const pgs = t === 'green' ? ['index'] : PAGES;
    for (const p of pgs) {
      const c = await ctx(browser, w, w === 375 ? 812 : 900, true); const pg = await c.newPage();
      await pg.goto(url(p, t)); await pg.waitForLoadState('networkidle');
      await runAxe(pg, `${p}@${w}`, t); await c.close();
    }
    if (t !== 'green') {
      const c = await ctx(browser, w, w === 375 ? 812 : 900, false); const pg = await c.newPage();
      await pg.goto(url('index', t, '&resetvisitor=1')); await pg.waitForSelector('#visitor-prompt', { state: 'visible', timeout: 5000 }).catch(() => {});
      const open = await pg.$('#visitor-prompt');
      if (!open) R.axe.push({ theme: t, label: `index-prompt@${w}`, rule: 'PROMPT-NOT-SHOWN', impact: 'n/a', selector: '#visitor-prompt' });
      await runAxe(pg, `index-prompt@${w}`, t); await c.close();
    }
  }
  // 2. overflow
  for (const t of THEMES) for (const p of PAGES) for (const w of [320, 375, 768, 1280]) {
    const c = await ctx(browser, w, 900, true); const pg = await c.newPage();
    await pg.goto(url(p, t)); await pg.waitForLoadState('networkidle');
    const r = await pg.evaluate(() => {
      const iw = innerWidth, sw = document.documentElement.scrollWidth, off = [];
      if (sw > iw) document.querySelectorAll('body *').forEach(e => { const b = e.getBoundingClientRect(); if (b.width && b.right > iw + 0.5) off.push((e.tagName + '.' + e.className + '#' + e.id).slice(0, 80) + ' right=' + Math.round(b.right)); });
      return { iw, sw, off: off.slice(0, 5) };
    });
    R.overflow.push({ theme: t, page: p, width: w, ok: r.sw <= r.iw, sw: r.sw, iw: r.iw, offenders: r.off });
    await c.close();
  }
  // 3. tap targets
  for (const t of THEMES) for (const p of PAGES) {
    const c = await ctx(browser, 375, 812, true); const pg = await c.newPage();
    await pg.goto(url(p, t)); await pg.waitForLoadState('networkidle');
    const r = await pg.evaluate(() => [...document.querySelectorAll('a,button')].map(e => {
      const b = e.getBoundingClientRect(), cs = getComputedStyle(e);
      if (!b.width || !b.height || cs.visibility === 'hidden' || cs.display === 'none') return null;
      if (e.classList.contains('skip-link')) return null;
      return { text: (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), sel: e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).split(' ')[0] : ''), w: Math.round(b.width), h: Math.round(b.height), inline: cs.display === 'inline' && !e.className };
    }).filter(Boolean));
    for (const x of r) { const m = Math.min(x.w, x.h); if (m < 24) R.tap.push({ theme: t, page: p, level: 'FAIL', ...x }); else if (m < 44) R.tap.push({ theme: t, page: p, level: 'warn', ...x }); }
    await c.close();
  }
  // 4. keyboard
  for (const t of THEMES) {
    const out = { theme: t, checks: [] }; const ok = (n, v, d) => out.checks.push({ n, ok: !!v, d: d || '' });
    const c = await ctx(browser, 375, 812, false); const pg = await c.newPage();
    await pg.goto(url('index', t, '&resetvisitor=1')); await pg.waitForSelector('#visitor-prompt', { state: 'visible', timeout: 5000 }).catch(() => {});
    const act = () => pg.evaluate(() => { const a = document.activeElement; return a ? (a.dataset && a.dataset.role) || a.id || a.textContent.trim().slice(0, 20) : null; });
    ok('prompt open', await pg.$('#visitor-prompt'));
    const first = await act(); ok('first button focused', first === 'patient', first);
    const seq = []; for (let i = 0; i < 4; i++) { await pg.keyboard.press('Tab'); seq.push(await act()); }
    ok('Tab cycles within prompt', seq.join() === 'provider,skip,patient,provider', seq.join());
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    ok('Escape closes', !(await pg.$('#visitor-prompt')));
    await pg.keyboard.press('Tab');
    const skipCls = await pg.evaluate(() => document.activeElement.className);
    ok('Tab lands on skip link', /skip-link/.test(skipCls), skipCls);
    await pg.keyboard.press('Enter'); await pg.waitForTimeout(100);
    ok('Enter focuses #main', (await pg.evaluate(() => document.activeElement.id)) === 'main');
    const tog = await pg.$('.nav-toggle');
    if (tog && await tog.isVisible()) {
      const a0 = await tog.getAttribute('aria-expanded'); await tog.click(); const a1 = await tog.getAttribute('aria-expanded'); await tog.click(); const a2 = await tog.getAttribute('aria-expanded');
      ok('Menu toggles aria-expanded', a0 !== a1 && a0 === a2, `${a0}>${a1}>${a2}`);
      await tog.focus();
      const bad = [];
      for (let i = 0; i < 10; i++) {
        await pg.keyboard.press('Tab');
        const r = await pg.evaluate(() => {
          const e = document.activeElement, pick = () => { const s = getComputedStyle(e); return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow, s.backgroundColor, s.textDecorationLine].join('|'); };
          const f = pick(), s = getComputedStyle(e); const hasOutline = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0;
          e.blur(); const b = pick(); e.focus(); return { name: e.tagName + ':' + (e.textContent || '').trim().slice(0, 20), differs: f !== b, hasOutline };
        });
        if (!r.differs && !r.hasOutline) bad.push(r.name);
      }
      ok('10 Tab stops show focus indicator', !bad.length, bad.join('; '));
    } else ok('Menu button visible at 375', false);
    R.keyboard.push(out); await c.close();
  }
  // 5. screenshots
  if (process.env.SHOTS) for (const t of THEMES) for (const p of PAGES) for (const w of [375, 1280]) {
    const c = await ctx(browser, w, w === 375 ? 812 : 900, true); const pg = await c.newPage();
    await pg.goto(url(p, t)); await pg.waitForLoadState('networkidle');
    const f = path.join(__dirname, `${t}-${p}-${w}.png`); await pg.screenshot({ path: f, fullPage: true });
    if (fs.statSync(f).size > 600 * 1024) { fs.unlinkSync(f); const j = f.replace('.png', '.jpg'); await pg.screenshot({ path: j, fullPage: true, type: 'jpeg', quality: 80 }); R.shots.push(j); } else R.shots.push(f);
    await c.close();
  }
  if (process.env.SHOTS) for (const t of THEMES) {
    const c = await ctx(browser, 375, 812, false); const pg = await c.newPage();
    await pg.goto(url('index', t, '&resetvisitor=1')); await pg.waitForSelector('#visitor-prompt', { state: 'visible', timeout: 5000 }).catch(() => {});
    const f = path.join(__dirname, `${t}-index-375-prompt.png`); await pg.screenshot({ path: f, fullPage: true });
    if (fs.statSync(f).size > 600 * 1024) { fs.unlinkSync(f); await pg.screenshot({ path: f.replace('.png', '.jpg'), fullPage: true, type: 'jpeg', quality: 80 }); }
    await c.close();
  }
  fs.writeFileSync(OUT, JSON.stringify(R, null, 1));
  await browser.close();
  console.log('done', OUT);
})();
