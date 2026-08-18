# Furry Image Studio Eval Protocol

This is the repeatable path for measuring whether a result is *authored*, not
merely pretty. One evaluation run contains one to eight accepted source/output
pairs that test the same claim. It never creates images, modifies images, or
reconstructs missing evidence.

## The one rule that matters

Record a pair only when the source image, accepted output, and exact generation
prompt are real evidence from the same attempt. For a pure generation, the
source must be a character, pose, or composition reference that actually
participated in the generation. Never use the output as its own source.

## Standard run

From the repository root, record an accepted result with the one canonical
development command:

```bash
npm run eval:record -- \
  --repo "$PWD" \
  --source /absolute/path/to/actual-input-reference.png \
  --output /absolute/path/to/accepted-output.png \
  --title "Moxie hibachi: authored-moment v1" \
  --prompt-file /absolute/path/to/exact-sent-prompt.txt \
  --character moxie \
  --style arcade-toon-documentary \
  --target "tiny rabbit at the right side of the hibachi table" \
  --model "reported-model" \
  --quality "reported-quality" \
  --size "reported-size" \
  --note "The fire surprise must read before the setting."
```

The command prints a `runPath`, `runId`, and `recorded` or `existing` status.
Only that structured receipt proves the trace exists. Repeating the exact same
evidence is safely idempotent; a changed output, prompt, profile, or setting
creates a new immutable run.

For an older result where the exact prompt was not retained, preserve that
truth instead of guessing:

```bash
npm run eval:record -- \
  --repo "$PWD" \
  --source /absolute/path/to/actual-input-reference.png \
  --output /absolute/path/to/accepted-output.png \
  --title "Historical result with unknown prompt" \
  --prompt-status missing \
  --character moxie \
  --style toon-in-real-world
```

## What the human reviewer scores

Every new run receives this seven-part 1–5 rubric, with 4 as the pass line:

1. **Target selection** — the requested person/character is the one changed.
2. **Character fidelity** — canon, markings, accessories, anatomy, and paws
   are correct.
3. **Story beat** — one emotionally specific moment is legible.
4. **Composition hierarchy** — the eye lands on the protagonist/action and
   returns there through reactions, staging, and quiet space.
5. **Character-specific acting** — behavior reveals intent beyond stock emotion.
6. **Physical integration** — perspective, object contact, occlusion, shadows,
   reflected color, and focus make the drawn toon occupy the space.
7. **Source preservation** — when editing a photo, the crop, setting, other
   people, props, text, and non-target evidence remain intact.

For a generated scene, score source preservation against the actual visual
reference and requested composition—not an invented source photo.

## Creator scorecard after every image

Every image-making skill asks the creator for a compact score before an
unsolicited next pass. A new scene uses Moment, Composition, Acting,
Integration, and Continuity; a photo edit uses Character, Preservation,
Acting, and Integration; a repair uses “did it fix the named defect?” plus one
repair score. Each is scored 1–5, followed by one requested repair at most.

These scores guide immediate repair and reveal which rubric criteria deserve
more weight or clearer definitions. Automatic recording is enabled: every
recordable output is copied into one immutable trace before its scorecard.
Scores never overwrite the recorded evidence. A text-only generation with no
genuine visual source remains explicitly unrecordable in v1; record that
limitation instead of fabricating a source.

## Small, useful eval set

Start with one claim and four to eight traces, not a grab bag. A good first
set for the new authorship system is:

- two single-character scenes testing the focal beat and acting;
- two crowded scenes testing hierarchy and quiet space;
- two photo edits testing object contact, occlusion, and source preservation;
- one Moxie hand/forearm close-up testing the dark-brown natural markings and
  claws; and
- one repair trace testing that a localized fix does not redraw the scene.

Do not alter prompts or the rubric halfway through the set. Log the claim,
cases, and accepted/rejected decision in the run title and notes. If the claim
changes, make a new run.

## Review, then judge

1. Start Trace Review with `npm run review:dev`, restart it after a new run,
   and complete the human scores and evidence annotations.
2. Export the completed review set from Trace Review. Exports are immutable.
3. Once at least four traces are complete, prepare a blind calibration set:

   ```bash
   npm run judge:prepare -- \
     --bundle evals/cases/<exported-bundle> \
     --out .furry-image-studio/judge-runs/authorship-v1 \
     --holdout 0.25
   ```

4. Calibrate the judge only against the human reviews, freeze its guidance,
   then run the holdout. The judge is a measurement instrument, never the
   authority that rewrites human grades.

## Entry-point contract

- From this checkout, use `npm run eval:record -- ...`.
- From an installed Codex plugin, the `record-eval-trace` skill invokes the
  bundled recorder automatically.
- Both paths expose the same CLI and immutable-run behavior. `make test`
  verifies the two help surfaces match, plus recorder and judge tests.
