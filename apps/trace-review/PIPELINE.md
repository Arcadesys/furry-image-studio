# Pipeline Contract

Furry Image Studio Trace Review consumes images produced by an external pipeline. It never calls an image-generation provider or accepts image uploads.

At startup, the reviewer scans each immediate subdirectory under
`evals/outputs/` for `manifest.json`. New pipeline runs become available after
the app restarts. Previously discovered manifests are not duplicated, and
changed manifests become new immutable review sets rather than overwriting
historical grades.

## Canonical Manifest

Paths are relative to the manifest file. Importers must reject paths that escape the manifest directory.

```json
{
  "schemaVersion": 1,
  "runId": "run-<content digest>",
  "title": "Grey mouse / sodium bar",
  "prompt": "Transform only the front-left subject into a cartoony grey-furred mouse.",
  "promptStatus": "recorded",
  "character": {
    "id": "grey-mouse",
    "snapshot": {
      "species": "anthropomorphic mouse",
      "fur": "medium grey"
    }
  },
  "style": {
    "id": "toon-in-real-world",
    "snapshot": {
      "backgroundPolicy": "preserve-exactly"
    }
  },
  "target": "front-left subject",
  "producedBy": "Codex / ChatGPT Desktop",
  "notes": "Five lighting and crowd-size cases.",
  "traces": [
    {
      "id": "trace-<content digest>",
      "source": "inputs/01-source.png",
      "output": "outputs/01-mouse.png",
      "target": "foreground subject",
      "notes": ["Preserve every non-target person"],
      "metadata": {
        "lighting": "dark sodium-lit bar",
        "whiteBalance": "strong warm amber"
      }
    }
  ]
}
```

Use `"prompt": null` and `"promptStatus": "missing"` when the original prompt was not recorded. Do not reconstruct missing evidence.

New pipeline producers should emit content-derived `runId` and trace `id`
values. Readers remain backward compatible with older manifests that omit
them. IDs must change when prompt, profile snapshots, settings, source bytes,
or output bytes change.

## Discovery Rules

- Read PNG and JPEG images up to 30 MB each when referenced by a manifest.
- Preserve unknown trace metadata in the review database and exported bundle.
- Hash every image with SHA-256 and deduplicate identical assets.
- Copy assets into local content-addressed storage; never edit the pipeline's originals.
- Treat a content-derived run directory as immutable. Re-recording identical
  evidence may reuse it; changed evidence must create a new directory.
- Report missing referenced files and unreferenced image files as warnings.
- Legacy `evals/sources/*/manifest.json` and `evals/outputs/*/manifest.json` files remain supported.

## Review Export

An explicit export creates a new timestamped directory under `evals/cases/`. It includes:

- the canonical manifest and prompt;
- character, style, and rubric snapshots;
- copied source and output images;
- criterion scores and annotation records;
- SHA-256 checksums for every exported file.

Exports are immutable. A second export creates a new directory instead of replacing the first.

## Codex Judge Calibration

Completed human reviews can calibrate an offline Codex image judge. The judge
pipeline consumes an exported bundle, creates blind source/output cases, runs
Codex outside this app, and compares sealed model results with hidden human
labels. It never writes model grades back into Trace Review.

See `evals/judges/codex/README.md` for the prepare, run, compare, and holdout
flows.
