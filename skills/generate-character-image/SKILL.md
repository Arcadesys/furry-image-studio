---
name: generate-character-image
description: Generate a new image of an arbitrary Furry Image Studio character in a selected rendering style. Use for portraits, scenes, stickers, reference-like illustrations, anime/cartoon/photoreal/storybook images, and new non-photo-edit character art.
---

# Generate Character Image

## Done State

Return a new generated image that follows one character profile, one style profile, and the user's requested scene or composition.

## Workflow

1. Load the requested character profile and references.
2. Load the requested style profile; default to the character's default style or ask if the task is style-sensitive.
3. Identify the intended use: portrait, full body, scene, sticker, banner, icon, or reference-like image.
4. Compose a prompt with image roles, character lock, style lock, scene, composition, and avoid list.
5. Use pure generation unless the user provided an image to edit or preserve.
6. Validate for character identity, style match, anatomy, accessories, and readable focal point.

## Prompt Skeleton

```text
Use case: generate
Primary goal: Create a new image of CHARACTER in STYLE.

Character lock:
Use the selected character profile and references for identity. Preserve required markings, species anatomy, colors, hair/fur/feathers/scales, accessories, clothing, body type, `paw_style`, and `finger_count`. Match this character, not a generic species.

Style lock:
Use the selected style profile for rendering only.

Scene and composition:
<user request: setting, action, camera angle, crop, mood, aspect ratio>

Avoid:
Generic character drift, missing required traits, extra limbs, extra tails/wings/ears, warped accessories, illegible tiny detail, watermarks, fake text, and unwanted style drift.
```

## Paw Style

If the character profile includes `paw_style` or `finger_count`, include them in the prompt:

- `human-like-hands`: human hand silhouette with character colors or fur.
- `hybrid-hands`: anthro hands, short claws or claw-like nails, optional pads only on visible palms.
- `full-paws`: paw-like hands with visible pads, claws, and thicker digits.
- `finger_count: auto`: choose what fits the character and style.
- `finger_count: five`: five digits per hand, including thumb.
- `finger_count: toon-four`: four digits per hand, thumb plus three fingers.

For close-ups, specify whether the palm side is visible. Pawpads only belong on palm-side surfaces.

## Low-Vision Friendly Default

When the user does not request dense detail, prefer large readable subjects, clear silhouettes, strong contrast, and no important information conveyed by tiny details or color alone.
