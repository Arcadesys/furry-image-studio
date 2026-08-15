# Trace Review Acceptance Ledger

## Done Metric

A reviewer can open pipeline-produced traces already present under
`evals/outputs`, grade and pin evidence on either image, restart without losing
work, and export an immutable checksum-verified bundle. The app contains no
image generation, upload, or credential path.

## Visual Fidelity

Reviewed at 1536 x 1024 against:

- `design/trace-review.png`

Latest captures:

- `.furry-image-studio/qa/latest-desktop.png`
- `.furry-image-studio/qa/latest-mobile.png`

| Contract | Verdict | Evidence |
| --- | --- | --- |
| Three-column desktop reviewer | Pass | Review-set rail, comparison canvas, and grading inspector retain the approved hierarchy. |
| High-contrast type and controls | Pass | 18 px root type, white-on-black text, 44 px minimum controls, visible focus rings. |
| Source/output evidence canvas | Pass | Paired desktop view, mobile image tabs, synchronized zoom/pan/fit/full-screen controls. |
| Pinned annotations | Pass | Keyboard-accessible numbered pins use image-normalized coordinates on source or output. |
| Existing eval discovery | Pass | Startup scans `evals/outputs/*/manifest.json`; no add, upload, or import controls exist. |
| No image generation | Pass | No provider SDK, API key, model control, generation job, or retry UI exists. |
| Responsive layout | Pass | 412 x 915 check shows no overlap or clipping in the primary review workflow. |

Intentional differences from the early concepts:

- "Run" is labeled "review set" to describe imported evidence accurately.
- The early "New run" and "Import set" actions were removed because the external
  pipeline exclusively owns trace creation.
- Unknown historical prompts and producer data remain visibly unknown.

## Verification

- TypeScript strict typecheck: pass.
- Vitest unit and backend integration suite: pass.
- Playwright desktop and mobile workflows: pass.
- Axe serious/critical violations: zero.
- Browser console warnings/errors: zero.
- Production Vite build: pass.
- Dependency audit: zero known vulnerabilities.
- Profile validation: pass.
