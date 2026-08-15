# Trace Review App Rules

## Product Boundary

This app reviews images produced by external pipelines. It must never generate or edit images.

Do not add:

- image-generation provider SDKs or API calls;
- API-key setup or credential storage;
- model, quality, or generation controls;
- generation queues, retries, or fake generation progress;
- automatic mutation of pipeline source images or manifests.

The supported flow is:

```text
external pipeline -> evals/outputs/* -> local human review -> regression bundle
```

The app discovers existing `evals/outputs/*/manifest.json` files at startup.
Do not add image upload controls, file-ingest endpoints, or in-app review-set
creation. The pipeline is the only producer of traces.

## Evidence Rules

- Missing prompts or metadata stay explicitly missing; do not reconstruct them.
- Copy discovered images into content-addressed local storage before review.
- Never rewrite pipeline manifests or source assets.
- Preserve unknown pipeline metadata through discovery and export.
- Exports are immutable and checksum-verified.

## Accessibility

- Body and control text must remain at least 18px.
- Interactive targets must remain at least 44px.
- Do not communicate state by color alone.
- Keep the complete review workflow keyboard accessible.
