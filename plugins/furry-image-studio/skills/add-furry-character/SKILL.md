---
name: add-furry-character
description: Add or update a reusable furry, anthro, toon, or creature character profile for Furry Image Studio. Use when the user wants to create a new character, fursona, OC, mascot, or reusable visual identity that future image generation or image editing skills can reference.
---

# Add Furry Character

## Done State

Create or update one character folder under the plugin's `assets/characters/` directory with a valid `character.md` profile and optional `references/` images. Bundled characters such as `moxie` are samples; users may add any number of arbitrary characters.

## Workflow

1. Identify the character name, species, and 3-12 locked visual traits.
2. Choose a `paw_style`: `human-like-hands`, `hybrid-hands`, or `full-paws`.
3. Choose a `finger_count`: `auto`, `five`, or `toon-four`.
4. Use `scripts/new_character.py` when creating a fresh profile.
5. Optionally copy from `assets/characters/_template/character.md` for a hand-authored profile.
6. Put reference images in `assets/characters/<id>/references/`.
7. List reference image paths in `reference_images`.
8. Run `scripts/validate_profiles.py`.
9. If required traits or references are ambiguous, leave clear profile placeholders instead of inventing canon.

## Character Contract

Character profiles define identity only. Do not bake rendering style into a character unless it is an essential identity trait.

Required frontmatter:

```yaml
id: lowercase-kebab-case
display_name: Character Name
species: red fox
paw_style: hybrid-hands
finger_count: auto
required_traits:
  - one concrete visual trait
  - another concrete visual trait
  - a third concrete visual trait
avoid:
  - generic species design
reference_images:
  - references/example.jpg
```

Useful optional fields:

```yaml
body_type: anthropomorphic character
default_style: toon-in-real-world
aliases:
  - nickname
pronouns: they/them
personality_tags:
  - confident
  - gentle
```

## Paw Style

Use `paw_style` to control hand anatomy:

- `human-like-hands`: human hand silhouette, fur/markings allowed, nails may remain nail-like.
- `hybrid-hands`: expressive anthro hands, short claws or claw-like nails, optional small pawpads only when palms are visible.
- `full-paws`: visibly paw-like hands with pawpads, claws, thicker digits, and less human nail structure.

When editing an existing photo, preserve object contact and gestures over forcing paw details. Pawpads should only appear on visible palm-side surfaces.

## Finger Count

Use `finger_count` independently from `paw_style`:

- `auto`: choose what fits the style, character, and pose.
- `five`: five digits per hand, including thumb.
- `toon-four`: four digits per hand, thumb plus three fingers.

For photo edits, preserve clear object contact over perfect digit count. If hands are partly hidden, do not invent visible extra fingers just to satisfy the count.

## Quality Rules

- `id` is lowercase kebab-case and matches the folder name.
- `required_traits` are concrete and visual, not vague praise.
- Reference images are role-labeled in the body when their use differs.
- `avoid` lists common drift risks: generic species, extra anatomy, wrong accessories, wrong age/presentation, or unwanted realism.
- No secrets, private contact info, credentials, or unrelated personal data belong in profiles.
