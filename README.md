# Furry Image Studio

Furry Image Studio is a local Codex plugin for generating, transforming, and repairing furry, anthro, toon, and creature character images.

It is profile-driven:

- `assets/characters/` stores arbitrary user-added characters.
- `assets/styles/` stores arbitrary rendering styles.
- Moxie is included as a sample character, not a hard-coded limit.

## What It Includes

- Add reusable character profiles.
- Add reusable style profiles.
- Transform a person in a photo into a selected character.
- Generate new character images.
- Repair common furry-image defects such as tails, paws, glasses, muzzle drift, and background drift.

## Character Controls

Character profiles support hand and paw preferences:

```yaml
paw_style: hybrid-hands
finger_count: toon-four
```

`paw_style` options:

- `human-like-hands`
- `hybrid-hands`
- `full-paws`

`finger_count` options:

- `auto`
- `five`
- `toon-four`

## Starter Styles

- `toon-in-real-world`
- `anime`
- `cartoon-world`
- `photorealism`
- `storybook`
- `sticker`

`toon-in-real-world` is protected: it transforms the subject only and preserves the real photo background.

## Validate

```bash
python3 scripts/validate_profiles.py
```

## Create A Character

```bash
python3 scripts/new_character.py "My Character" \
  --species "red fox" \
  --paw-style hybrid-hands \
  --finger-count toon-four \
  --trait "warm orange fur" \
  --trait "cream muzzle and chest" \
  --trait "purple glasses"
```

Then add reference images to:

```text
assets/characters/<character-id>/references/
```

and list them in that character's `character.md`.
