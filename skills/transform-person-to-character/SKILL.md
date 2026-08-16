---
name: transform-person-to-character
description: Transform a selected person in an uploaded or referenced photo into an arbitrary Furry Image Studio character while preserving the photo, pose, crop, background, objects, text, and other people. Use for toon-in-real-world fursona edits, character transformations, and identity-preserve image edits.
---

# Transform Person To Character

## Done State

Return an edited image where only the selected subject is transformed into the selected character and the requested style/scope rules are respected.

## Workflow

1. Inspect the target image with `view_image` before image editing when a local path is provided.
2. Load the selected character profile from `assets/characters/<id>/character.md` and inspect its references.
3. Load the selected style from `assets/styles/<id>.md`; default to the character's `default_style`, then `toon-in-real-world`.
4. If multiple people are plausible targets and the user did not identify one, ask which subject to transform.
5. Use image editing, not pure generation.
6. Label every input image role: edit target, character reference, style reference, pose reference, or composition reference.
7. Compose the prompt from: use case, primary goal, image roles, character lock, style lock, physical-integration requirements, preserve, change only, avoid.
8. Validate the result against the source image and selected profiles. Regenerate if the background, crop, text, objects, other people, perspective, occlusion, or object contact drift.
9. When the user explicitly requested eval mode, use `record-eval-trace` after
   accepting the result. Pass the original photo as source, the generated local
   file as output, and the exact composed image prompt. Do not record ordinary
   transformations.

## Prompt Skeleton

```text
Use case: identity-preserve image edit
Primary goal: Transform only the selected person into CHARACTER in STYLE.

Input images:
- Image 1: edit target
- Character references: identity only
- Style references, if any: rendering style only, not content or composition

Character lock:
Apply the selected character profile exactly. Match the referenced character, not a generic species.
Apply the character's `paw_style` and `finger_count` when hands are visible.

Style lock:
Apply the selected style profile. If the style is toon-in-real-world, preserve the real photo background exactly and transform only the selected subject.

Preserve:
Original crop, aspect ratio, camera angle, background, lighting direction, shadows, reflections, visible text, objects, other people, pose, gesture, gaze direction, body placement, scale, clothing silhouette, and scene interactions.

Change only:
The selected subject's species/character design and necessary localized integration effects.

Physical integration:
Match camera height and perspective. Add only localized contact shadows and
reflected environmental color needed to make the drawn character occupy the
photo. Respect real-object occlusion: a glass, table, chair, controller, or
foreground object must pass in front of or support the character where the
source geometry requires it. Match the source depth of field; do not sharpen a
background subject into the focal plane.

Avoid:
Scene redraw, background cleanup, fake text, new objects, extra limbs, extra tails, extra ears, warped glasses, generic fursona drift, horror anatomy, mascot-head mask effect, and full-scene restyle unless explicitly requested by an allowed style scope.
```

## Anatomy Rules

- Add tails, wings, horns, or other anatomy only when attachment is visible and physically plausible.
- If a tail cannot clearly attach at the tailbone/pelvis in the pose and crop, omit it.
- Exactly one tail unless the character profile explicitly requires otherwise.
- Preserve hands/paws that interact with objects; do not break contact points.
- `human-like-hands`: keep a human hand silhouette with fur or markings. Nails can remain nail-like.
- `hybrid-hands`: use anthro hands with short claws or claw-like nails. Add small pawpads only when the palm side is visible.
- `full-paws`: use clearly paw-like hands with pawpads, claws, thicker digits, and less human nail structure.
- `finger_count: auto`: choose the digit count that best fits the character, selected style, and source pose.
- `finger_count: five`: preserve five digits per hand, including thumb.
- `finger_count: toon-four`: use four digits per hand, thumb plus three fingers, especially for cartoon/anime toon looks.
- Do not put pawpads on the backs of hands. Do not add claws where they would break phone, pen, tool, or table interactions.
- If fingers are hidden by an object, do not invent extra visible fingers. Object contact and believable gesture win.

## Toon In Real World

For `toon-in-real-world`, hard-lock these rules:

- Subject-only transformation.
- Real background unchanged.
- Mild localized integration only: film grain, soft halation, warm rim light, slight bloom, painterly edge softening.
- Use correct contact shadows, reflected room color, occlusion, perspective, and depth-of-field softness. These are integration, not permission to relight or restage the photo.
- The visible reality/cartoon contrast is intentional.
