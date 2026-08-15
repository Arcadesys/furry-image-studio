# Codex As Image Judge

This pipeline measures a Codex image judge against completed human reviews. It
runs outside Trace Review and never writes model scores into human review data.

## Flow

1. In Trace Review, complete grades and export the review set.
2. Prepare blind cases from the exported bundle.
3. Run Codex on source/output pairs without human scores, notes, or pins.
4. Compare the sealed judge results with the hidden human gold labels.

`prepare` verifies every bundle checksum and includes only completed human
reviews. It deterministically reserves 25% as holdout when at least four
completed traces are available. Do prompt work on the calibration partition;
use the holdout only after the judge instructions are frozen.

## Commands

Prepare a calibration set:

```bash
npm run judge:prepare -- \
  --bundle evals/cases/toon-mouse-20260729T000000000Z \
  --out .furry-image-studio/judge-runs/mouse-v1 \
  --holdout 0.25
```

Run the calibration partition with an explicit model:

```bash
npm run judge:run -- \
  --calibration .furry-image-studio/judge-runs/mouse-v1 \
  --model gpt-5.4 \
  --partition calibration \
  --concurrency 2
```

The command prints an immutable attempt directory. Compare that attempt:

```bash
npm run judge:compare -- \
  --calibration .furry-image-studio/judge-runs/mouse-v1 \
  --attempt .furry-image-studio/judge-runs/mouse-v1/attempts/<attempt>
```

After freezing `judge-guidance.md`, run a new holdout attempt:

```bash
npm run judge:run -- \
  --calibration .furry-image-studio/judge-runs/mouse-v1 \
  --model gpt-5.4 \
  --partition holdout
```

For a one-command exploratory run:

```bash
npm run judge:all -- \
  --bundle evals/cases/toon-mouse-20260729T000000000Z \
  --model gpt-5.4
```

## Metrics

The agreement report includes:

- mean absolute score error;
- exact and within-one score agreement;
- observable criterion coverage;
- criterion and whole-case pass/fail agreement;
- per-criterion error;
- location recall of human evidence pins within a normalized image radius;
- strict location-plus-category pin recall;
- pin category/severity agreement and extra judge pins.

The default policy in `policy.json` marks a judge `calibrated` only when all
gates pass. Fewer than four compared traces returns `insufficient-data`; larger
calibration and holdout sets produce more trustworthy results.

The current measured baseline and ratchet log are in
[`BASELINE.md`](BASELINE.md).

## Isolation

Each Codex call runs ephemerally in a fresh temporary directory containing only
the source image, output image, and output schema. Project rules and user config
are disabled for the judge process; authentication still comes from the local
Codex installation. The human gold file is never copied into that directory or
included in the prompt.
