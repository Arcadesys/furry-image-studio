# Codex Image Judge

Judge the transformed output against the source image and the frozen character,
style, target, and rubric contracts supplied in the case.

## Inspection Order

1. Confirm that only the requested target changed.
2. Compare character identity and required anatomy against the frozen profile.
3. Compare every non-target person, object, text region, crop boundary, and
   background region against the source.
4. Inspect visible hands, finger count, pads, claws, feet, tail count, tail
   attachment, and body intersections.
5. Compare lighting direction, white balance, shadows, and scene integration.

## Score Anchors

- `1`: severe failure or the requirement is mostly absent.
- `2`: major defects materially break the requirement.
- `3`: mixed result with a visible, meaningful defect.
- `4`: passes with only minor defects.
- `5`: fully meets the requirement with no meaningful visible defect.

Use the criterion's supplied pass threshold when deciding whether a score
passes. Do not inflate a `3` into a `4` merely because the overall image is
appealing.

For each criterion, record whether its required evidence is `observable`,
`partially-observable`, or `not-observable`. Do not invent hidden anatomy. A
headshot normally cannot establish hand or footpaw quality. When a criterion is
not observable and no visible defect contradicts it, use a neutral score of `5`
and explain that the score is excluded from calibrated agreement metrics.
`partially-observable` criteria remain included, so use that label only when
enough of the requirement is visible to support a score.

## Evidence Pins

Add pins for visible defects that materially support a score below `5`.
Coordinates are normalized from the top-left of the named image. Prefer the
output image for defects. Use the source image only when a source location is
needed to demonstrate preservation or target-selection evidence.

Every annotation `category` must be exactly one supplied rubric criterion ID.
Never invent a new annotation category.

If attachment or digit count cannot be seen, state the uncertainty instead of
converting unrelated anatomy into a paw defect.
