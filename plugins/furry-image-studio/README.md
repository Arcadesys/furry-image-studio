# Furry Image Studio

Furry Image Studio is a **Codex / ChatGPT Desktop skill plugin** for generating, transforming, and repairing furry, anthro, toon, and creature character images.

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

## Install In Codex / ChatGPT Desktop

Install the marketplace from GitHub:

```bash
codex plugin marketplace add Arcadesys/furry-image-studio
```

Then install the plugin:

```bash
codex plugin add furry-image-studio@furry-image-studio
```

Restart Codex or start a new Codex / ChatGPT Desktop thread so the new skills are loaded.

Check installation:

```bash
codex plugin list
```

## Local Development Install

Clone the repo:

```bash
git clone https://github.com/Arcadesys/furry-image-studio.git
cd furry-image-studio
```

Add the local checkout as a marketplace:

```bash
codex plugin marketplace add .
codex plugin add furry-image-studio@furry-image-studio
```

After editing skills or profiles, bump the plugin version before reinstalling so Codex refreshes its cache.

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
