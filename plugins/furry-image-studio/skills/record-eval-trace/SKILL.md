---
name: record-eval-trace
description: Automatically record every recordable Furry Image Studio source/output image pair as an immutable evaluation run; also use to add a previous result to Trace Review.
---

# Record Eval Trace

## Done State

Record a produced source/output pair, exact composed prompt, profile snapshots,
and available generation metadata into one checksum-backed canonical run under
the user's Furry Image Studio checkout. Do not generate or edit an image in this
skill.

## Automatic Recording Policy

- Record every generated, transformed, and repaired output by default when the
  actual local output and a genuine visual source are available.
- Do this immediately after output creation, before asking for the creator
  scorecard; do not wait for an image to be called definitive.
- One output creates one immutable trace. A repair uses its immediate parent as
  source; a transformation uses the original photo; a generation uses only a
  character, pose, or composition reference that actually participated.
- Never regenerate merely to record. Do not use the output as its own source,
  and never invent a source just to satisfy automatic recording.
- If the output is not recordable, return it with an explicit receipt such as:
  `Eval: not recorded — no genuine visual source was used by v1 Trace Review.`
  This is an evidence limitation, not a failure silently ignored.

Automatic records copy the source, output, exact prompt, profile snapshots, and
available generation metadata into the local eval checkout. This policy is for
the user who has explicitly enabled automatic Furry Image Studio output
recording; if they later ask to stop, revert to explicit-only recording.

## Workflow

1. Resolve the eval checkout from `FURRY_IMAGE_STUDIO_EVAL_REPO`, the current
   workspace when it contains `apps/trace-review/PIPELINE.md`, or an explicit
   repository path from the user.
2. Identify the local source image and produced local output image. For a
   generated image, use a visual character, pose, or composition reference that
   actually participated in generation. Never invent or mislabel a source.
3. Preserve the exact prompt sent to image generation, not a reconstruction. If
   a historical prompt is unavailable, record `promptStatus: missing`; do not
   guess it.
4. Record selected character and style IDs. Pass explicit profile paths when
   profiles live outside the checkout or bundled plugin.
5. Include model, quality, size, and other settings when the image tool reports
   them. Leave unavailable fields absent.
6. Run `../../scripts/record_eval_run.mjs` from this skill's plugin root context.
7. Report the returned `runPath`, `runId`, and whether the run was newly
   `recorded` or already `existing`.
8. If recording fails, still return the image and state clearly that
   no eval trace was recorded.

The v1 reviewer compares a source and output image. A truly text-only generation
with no visual input cannot be recorded yet. Do not substitute the output as its
own source.

## Single-Trace Command

```bash
node <plugin-root>/scripts/record_eval_run.mjs \
  --repo <furry-image-studio-checkout> \
  --source <source-image> \
  --output <accepted-generated-image> \
  --title "<review-set title>" \
  --prompt-file <exact-image-prompt.txt> \
  --character <character-id> \
  --style <style-id> \
  --target "<selected subject>" \
  --model "<reported model>" \
  --quality "<reported quality>" \
  --size "<reported size>"
```

For multiple traces or inline profile snapshots, use `--spec <spec.json>`.
Paths inside a spec are relative to the spec file. The recorder accepts one to
eight traces and writes the complete run atomically.

For a historical result with no exact prompt, pass `--prompt-status missing`
and omit both prompt arguments. Do not use this merely because the automatic
flow failed to retain a new prompt; preserve the exact prompt at generation time.

## Evidence Rules

- The recorder copies evidence; it never changes source or output images.
- Run and trace IDs derive from prompt, profiles, settings, and image hashes.
- Repeating the same recording returns the existing run.
- Changed evidence creates a different run and never overwrites prior reviews.
- Do not claim success unless the recorder returns structured output.
