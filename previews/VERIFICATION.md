# Verification report

Date: Nov. 4, 2026

## Tools
- axe-core 4.10.2 (tags wcag2a, wcag2aa, wcag21a, wcag21aa)
- Playwright with Chromium 153.0.8010.12 (headless), deviceScaleFactor 1
- Site served with `python3 -m http.server`; visitor prompt suppressed via localStorage `hesjlp-visitor`, except where tested open (`?resetvisitor=1`).

## Results

| Check | green | civic | warm |
|---|---|---|---|
| axe violations (6 pages x 375/1280, plus prompt-open index; green: index only) | 0 | 0 | 0 |
| Horizontal overflow (6 pages x 320/375/768/1280) | none | none | none |
| Tap targets under 24px (FAIL) | 0 | 0 | 0 |
| Tap targets 24-43px (warning) | 14 | 14 | 14 |
| Keyboard (prompt focus/cycle/Escape, skip link, #main, menu toggle, focus indicators) | pass | pass | pass |

Tap-target warnings are all inline text links in body copy or footer (e.g. "About this site" x6, "Manage My Case", "CareLink", external resource links), 28-39px tall at 375 and wide. None is below WCAG 2.2 target-size minimum (24px).

## Open issues
- None blocking. Optional: enlarge the footer "About this site" and inline resource links toward 44px height.

## Re-run
```
npm i playwright axe-core
python3 -m http.server 8123 --directory /path/to/HESJLP &
SHOTS=1 node previews/run-checks.js http://localhost:8123 results.json   # SHOTS=1 also regenerates screenshots
```
`run-checks.js` writes results.json (axe violations, overflow, tap targets, keyboard checks).
