# Furry Image Studio

Furry Image Studio is a Codex / ChatGPT Desktop plugin for generating,
transforming, and repairing furry, anthro, toon, and creature character images.
It gives an image-capable harness reusable character and rendering-style
profiles instead of baking one character or visual look into prompts.

## Install in a Codex harness

The public marketplace is this repository. A fresh Codex harness can install
the published plugin with these two commands:

```bash
codex plugin marketplace add Arcadesys/furry-image-studio
codex plugin add furry-image-studio@furry-image-studio
```

Start a new Codex or ChatGPT Desktop task after installation so it loads the
new skills. Confirm the install with:

```bash
codex plugin list
```

The expected entry is `furry-image-studio` from the
`furry-image-studio` marketplace. No API key, MCP server, or companion app is
required to use the public plugin.

For a local checkout, use its absolute path as the marketplace root:

```bash
git clone https://github.com/Arcadesys/furry-image-studio.git
cd furry-image-studio
codex plugin marketplace add "$PWD"
codex plugin add furry-image-studio@furry-image-studio
```

After changing the packaged plugin, give
`plugins/furry-image-studio/.codex-plugin/plugin.json` a new cache-busted
version and reinstall it. Start a new task to test the changed skills.

## How the repository works

The repository has two intentional layers:

```text
.agents/plugins/marketplace.json  -> marketplace entry for Codex
plugins/furry-image-studio/        -> exact directory Codex installs
assets/, skills/, scripts/         -> canonical authoring copy
services/eval-mcp/                 -> optional private trace service
```

`plugins/furry-image-studio/` is the release package named by the marketplace.
The root `assets/`, `skills/`, `scripts/`, manifest, and README are the
canonical authoring copy and must match their counterparts in that package.
`python3 scripts/test_plugin.py` enforces that release boundary, so a change
cannot silently land in only one copy.

### Profiles and skills

- `assets/characters/<id>/character.md` defines one character's identity:
  species, locked traits, reference images, paw style, and finger count.
- `assets/styles/<id>.md` defines rendering behavior. Styles never replace a
  character's identity.
- `skills/*/SKILL.md` tells the harness when and how to add profiles, generate
  art, transform a selected subject in a photo, or repair one named defect.
- `scripts/new_character.py` and `scripts/new_style.py` create valid profile
  starters; `scripts/validate_profiles.py` validates their frontmatter.

Moxie and the included styles are examples, not limits. Users can add any
number of profiles. `toon-in-real-world` is intentionally constrained to a
subject-only edit with the real background preserved.

### Optional private eval service

`services/eval-mcp` is not installed by this plugin. It is a separately run,
private service for applications that need checksum-backed image-evaluation
claims without placing customer images in the public repository. Its tests are
part of the repository test command, but production use requires a private
storage volume and a service token.

```bash
cd services/eval-mcp
npm ci
EVAL_TRACE_SERVICE_TOKEN="a-long-private-service-token" npm start
```

Set `EVAL_TRACE_STORAGE_ROOT` to a private persistent volume when hosting it.
The service provides `POST /mcp`, private short-lived artifact ingress, and
`GET /health`.

## Test before release

The full repository check uses only Python's standard library plus the
committed Node lockfile:

```bash
make test
```

Equivalent commands, useful in a minimal harness:

```bash
python3 scripts/test_plugin.py
npm ci --prefix services/eval-mcp
npm test --prefix services/eval-mcp
```

The Python check validates marketplace wiring, the plugin manifest, every
skill's frontmatter, all character/style profiles, helper-script entry points,
and the source-to-release synchronization. GitHub Actions runs the same checks
on pushes and pull requests.

## Create a character

```bash
python3 scripts/new_character.py "My Character" \
  --species "red fox" \
  --paw-style hybrid-hands \
  --finger-count toon-four \
  --trait "warm orange fur" \
  --trait "cream muzzle and chest" \
  --trait "purple glasses"
```

Add reference images under `assets/characters/<character-id>/references/`,
then list their relative paths in that character's `reference_images` field.

## Character controls

```yaml
paw_style: hybrid-hands
finger_count: toon-four
```

`paw_style` is one of `human-like-hands`, `hybrid-hands`, or `full-paws`.
`finger_count` is one of `auto`, `five`, or `toon-four`.
