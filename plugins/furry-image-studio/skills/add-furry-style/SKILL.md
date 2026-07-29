---
name: add-furry-style
description: Add or update a reusable Furry Image Studio rendering style such as toon-in-real-world, photorealism, cartoon-world, anime, storybook, sticker, painterly, comic, or another user-defined style.
---

# Add Furry Style

## Done State

Create or update one valid style profile under `assets/styles/` that describes rendering behavior without overriding character identity. Bundled styles are samples and defaults; users may add arbitrary new styles.

## Workflow

1. Identify the style name and intended use.
2. Decide default scope:
   - `subject-only` for preserving a source image while changing one subject.
   - `full-image` for fully generated scenes or full-scene restyles.
3. Decide background policy:
   - `preserve-exactly`
   - `match-mode`
   - `stylize-allowed`
   - `transparent-or-simple`
4. Use `scripts/new_style.py` for a new profile.
5. Optionally copy from `assets/styles/_template.md` for a hand-authored profile.
6. Run `scripts/validate_profiles.py`.

## Style Contract

Styles define how the image looks. Characters define who appears in it. When a style conflicts with character identity, character identity wins.

Required frontmatter:

```yaml
id: lowercase-kebab-case
display_name: Style Name
default_scope: full-image
allowed_scopes:
  - subject-only
  - full-image
background_policy: stylize-allowed
rendering:
  - concrete rendering instruction
avoid:
  - concrete drift risk
```

## Protected Style

`toon-in-real-world` is special:

- `default_scope: subject-only`
- `allowed_scopes: [subject-only]`
- `background_policy: preserve-exactly`

Do not convert the whole image to a cartoon for this style. The point is a stylized character inside an unchanged real photo.
