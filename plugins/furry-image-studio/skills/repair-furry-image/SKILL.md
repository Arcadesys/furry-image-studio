---
name: repair-furry-image
description: Repair a specific defect in a furry, anthro, toon, or character image while preserving the rest of the image. Use for fixing tail attachment, paws/hands, glasses, muzzle, anatomy, generic character drift, background drift, style drift, or uncanny mask effects.
---

# Repair Furry Image

## Done State

Return an edited image that fixes one named defect while preserving all non-defective areas as much as possible.

## Workflow

1. Inspect the source image with `view_image` when available as a local path.
2. Identify exactly one repair target for the pass.
3. Load the relevant character and style profiles if identity or style must be preserved.
4. Use image editing, not pure generation.
5. Prompt: repair only the defect; preserve character identity, pose, crop, background, lighting, clothing, expression, and all non-defective areas.
6. Validate that the repair did not introduce new drift.
7. When the user explicitly requested eval mode, use `record-eval-trace` after
   accepting the repair. Pass the pre-repair image as source, the repaired local
   file as output, and the exact repair prompt. Do not record ordinary repairs.

## Common Repair Targets

- Tail floats or attaches too high: attach at visible tailbone/pelvis or omit if impossible.
- Wings pasted onto clothing: attach anatomically at the upper back/shoulders only if visible and plausible.
- Glasses warped: preserve frame color, shape, alignment, and lens placement.
- Muzzle uncanny: soften into the selected style; avoid mascot head, mask, horror teeth, or human nose remnants.
- Hands/paws broken: preserve object contact and gesture.
- Too human or too paw-like hands: repair to the character's `paw_style`.
- Pawpads misplaced: pawpads only belong on visible palm-side surfaces, never the back of the hand.
- Claws/nails wrong: use nail-like details for `human-like-hands`, short claws for `hybrid-hands`, and clear claws for `full-paws`.
- Wrong digit count: repair to `finger_count` when hands are visible. `toon-four` means thumb plus three fingers; `five` means thumb plus four fingers.
- Background drift: restore source background; do not redraw or beautify.
- Style drift: reapply only the style profile; do not change character identity.
- Generic species drift: reassert required character traits and references.

## Repair Prompt

```text
Use case: repair
Primary goal: Repair only this defect: <specific defect>.

Character lock:
Preserve the selected character identity, required traits, `paw_style`, and `finger_count`.

Style lock:
Preserve the selected style.

Preserve:
Crop, pose, background, lighting, clothing, expression, props, text, other people, and all non-defective areas.

Change only:
The named defect.

Avoid:
Full-image redraw, new character design, new objects, fake text, extra anatomy, pose changes, background changes, and unrelated beautification.
```
