# Metrics Guide

Lightweight, repeatable code metrics to track DRY/refactor impact.

## What we measure
- **LOC/File counts**: via `cloc` (templates, scripts, styles).
- **Duplication**: via `jscpd` (JavaScript, Handlebars, SCSS).
- **JS Complexity**: via `escomplex` (cyclomatic, top offenders).
- Existing: `npm run metrics:styles` (SCSS line count and CSS bytes).

Reports are written to `reports/metrics/`:
- `cloc.json`, `jscpd-report.json`, `complexity.json` (embedded in snapshot)
- `snapshot.json` (latest run)
- `snapshots/<label>.json` (labeled snapshots)

## Commands
- Clean reports:  
  `npm run metrics:clean`

- Generate metrics (writes `reports/metrics/snapshot.json` and `snapshots/<label>.json`):  
  `npm run metrics`  
  Optional label: `npm run metrics -- --label before`

- Compare snapshots:  
  `npm run metrics:diff -- --baseline reports/metrics/snapshots/before.json --current reports/metrics/snapshots/after.json`

- Style size quick check (existing):  
  `npm run metrics:styles`

## Typical workflow
1) Capture a baseline before changes:  
   `npm run metrics -- --label before`
2) Make refactors/DRY changes.
3) Capture after:  
   `npm run metrics -- --label after`
4) Compare:  
   `npm run metrics:diff -- --baseline reports/metrics/snapshots/before.json --current reports/metrics/snapshots/after.json`

## Interpreting results
- **LOC**: Down is usually good if functionality is unchanged. Track per-language.
- **Duplication (jscpd)**: Watch `%` and clone count; lower is better.
- **Complexity (escomplex)**: Lower max cyclomatic and fewer high-complexity functions are better. Check `topFunctions` in snapshot for hotspots.
- **CSS size**: Use `metrics:styles` to keep SCSS lines/CSS bytes in check.

## Scope & ignores
The metrics scripts scan:
- Templates: `templates/**/*.hbs`
- Styles: `styles/**/*.scss` (ignoring compiled CSS)
- Scripts: `scripts/**/*.js`

Ignored directories: `node_modules`, `dist`, `build`, `coverage`, `reports`, `styles/css`, `packs`.

## CI note
No CI gating is enforced. If you add a CI job, run `npm run metrics` and publish `reports/metrics/` as an artifact. No runtime/bundle dependencies were added; tools are dev-only.***
