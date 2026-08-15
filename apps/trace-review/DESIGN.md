# Trace Review Design Contract

## Primary Screen

- Reference: `design/trace-review.png` at 1536x1024.
- Three columns: run rail, dominant source/output workspace, grade inspector.
- Near-black background, true white text, cyan focus/selection, yellow issues.
- Body and control text is at least 18px. Interactive targets are at least 44px.
- Selection and pass/issue state always include text or a border, never color alone.
- Source and output images use equal, stable frames with synchronized zoom and pan.

## Existing Eval Source

- The header identifies `evals/outputs` as the active evidence source.
- The app reads review sets already produced by the pipeline at startup.
- There are no add, upload, or import controls in the reviewer.
- Prompt, profiles, target, producer, and notes remain immutable evidence metadata.
- No provider calls, API keys, model controls, generation jobs, or retry controls.

## Responsive Behavior

- Below 1100px, the run rail becomes a drawer and the inspector moves below the canvas.
- Below 720px, Source and Output become large tabs rather than shrinking side by side.
- All functionality remains keyboard reachable and screen-reader labeled.
