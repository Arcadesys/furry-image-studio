---
name: record-eval-trace
description: Record an existing Furry Image Studio source/output image pair as an immutable evaluation run. Use when the user says eval mode, record this trace, add this result to the eval set, or add a previous Codex-generated Furry Image Studio image to trace review.
---

# Record Eval Trace

## Done State

Record the accepted source/output pair, exact composed prompt, profile snapshots,
and available generation metadata into one checksum-backed canonical run under
the user's Furry Image Studio checkout. Do not generate or edit an image in this
skill.

## Activation

- Record only when the user explicitly requests eval mode or asks to add a result.
- Ordinary generation, transformation, and repair requests must not create eval data.
- Recording must reuse the accepted local output. Never regenerate merely to record it.

## Workflow

1. Resolve the eval checkout from `FURRY_IMAGE_STUDIO_EVAL_REPO`, the current
   workspace when it contains `apps/trace-review/PIPELINE.md`, or an explicit
   repository path from the user.
2. Identify the local source image and accepted local output image. For a
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
8. If recording fails, still return the accepted image and state clearly that
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
and omit both prompt arguments.

## Evidence Rules

- The recorder copies evidence; it never changes source or output images.
- Run and trace IDs derive from prompt, profiles, settings, and image hashes.
- Repeating the same recording returns the existing run.
- Changed evidence creates a different run and never overwrites prior reviews.
- Do not claim success unless the recorder returns structured output.
