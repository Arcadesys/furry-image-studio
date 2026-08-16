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
4. Write a one-beat scene brief before composing: protagonist, what just happened, visible want, secondary reaction, and first eye landing point.
5. Compose a prompt with image roles, character lock, style lock, scene brief, composition hierarchy, integration rules, and avoid list.
6. Use pure generation unless the user provided an image to edit or preserve.
7. Validate for character identity, style match, anatomy, accessories, physical integration, and authorship hierarchy.
8. Curate: keep only a result that passes the authorship test; identify one specific repair if it is close, otherwise treat it as a sketch.
9. When the user explicitly requested eval mode and generation used a visual
   character, pose, or composition reference, use `record-eval-trace` after
   accepting the result. Pass that actual reference as source, the generated
   local file as output, and the exact composed image prompt. Never use the
   output as its own source.

## Prompt Skeleton

```text
Use case: generate
Primary goal: Create a new image of CHARACTER in STYLE.

Character lock:
Use the selected character profile and references for identity. Preserve required markings, species anatomy, colors, hair/fur/feathers/scales, accessories, clothing, body type, `paw_style`, and `finger_count`. Match this character, not a generic species.

Style lock:
Use the selected style profile for rendering only.

Scene brief:
- Protagonist: <who owns this image>
- Just happened: <the exact change/event>
- Visible want: <what the protagonist is trying to do>
- Secondary reaction: <one character behavior that sharpens the beat>
- First eye landing point: <face/action/prop>

Composition and integration:
<camera angle, crop, mood, aspect ratio; primary action; secondary reaction;
supporting figures directing attention; deliberate quiet space; foreground /
middle ground / background separation; object contact; contact shadows;
occlusion; perspective; depth-of-field behavior>

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

## Authorship Gate

Before accepting a generated image, answer these five checks explicitly:

1. Can I name one emotionally specific moment, rather than merely the setting?
2. Does one protagonist/action claim the first look, with one secondary reaction?
3. Do the supporting figures and quiet areas conduct the eye back to that beat?
4. Does every visible character behave in a character-specific way rather than a stock pose?
5. Do the drawn characters occupy the space through perspective, occlusion,
   contact, shadows, reflected color, and focus behavior?

If any answer is no, do not call the image definitive. Repair one named fault
when the frame is otherwise strong; otherwise log it as a sketch and regenerate
from a sharper scene brief.
