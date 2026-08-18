# Furry Image Studio

**Reusable AI character-transformation tools for Codex and ChatGPT.**

Furry Image Studio is an installable Codex / ChatGPT Desktop plugin that turns
furry, anthro, toon, and creature image workflows into reusable skills with
character-identity profiles, rendering-style profiles, validation, and
multimodal evaluation.

Character identity stays separate from rendering style, so the same character
can move across visual treatments without losing canon. The skills support new
image generation, selected-subject transformation, and localized repair.

## Engineering highlights

- Installable Codex plugin with reusable image-workflow skills
- Canon-preserving separation between character identity and rendering style
- Generation, selected-subject transformation, and localized repair workflows
- Canonical authoring files mirrored into a verified release package
- Profile validation, CI, and release-contract tests that prevent package drift
- Optional private MCP evaluation service with checksum-backed trace artifacts
- Human evaluation, calibrated model judging, and regression workflows for accepted image pairs

### Architecture

```text
User + references → Skill → Identity profile + Style profile → Generate / transform / repair → Human review
Accepted source/output pair → Eval recorder → Private trace store → Regression evidence
```

## Why this exists

Furry identity is deeply visual, but seeing yourself as your fursona can require
access to commissioned artwork or a fursuit—both meaningful forms of expression
that can also be expensive.

Furry Image Studio explores a more accessible entry point: a small convention
photo booth where someone can take a picture and receive an image of themselves
as their character—preserving the person, pose, clothing, and moment while
transforming their appearance.

The goal is not to replace artists, commissions, or fursuits. It is to give
more people an immediate and affordable way to participate, recognize
themselves in their character, and leave the convention with a personal
artifact.

**Snap a photo. Become your fursona. Take the moment home.**

## ChatGPT Desktop — Codex plugin

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

### Use it in Desktop

Attach the real photo and any character-reference images, then identify the
person to transform and the requested character/style. The installed skills
will use the character and style profiles to make a subject-only edit when
`toon-in-real-world` is selected.

### Copy-paste installation prompt

Paste this into a ChatGPT Desktop task when you want its Codex harness to
install the plugin for you:

```text
Install Furry Image Studio from its public Codex marketplace in this ChatGPT Desktop installation.

Run:
codex plugin marketplace add Arcadesys/furry-image-studio
codex plugin add furry-image-studio@furry-image-studio
codex plugin list

Confirm that `furry-image-studio` is installed from the `furry-image-studio` marketplace. Do not configure the optional private eval MCP service or request an API key. When installation succeeds, tell me to start a new ChatGPT Desktop task so its Furry Image Studio skills are available.
```

## ChatGPT web and Android — Project companion

This is a companion to the Codex plugin, not an Android app. It uses ordinary
ChatGPT Images, so there is no separate photo-conversion service, API key, or
per-conversion provider to configure. It works even when Custom GPT creation
is unavailable.

### ChatGPT web setup

1. Create a **Furry Image Studio** ChatGPT Project.
2. Add
[`PROJECT_LIBRARY.md`](https://github.com/Arcadesys/furry-image-studio/blob/main/chatgpt/PROJECT_LIBRARY.md)
as a project file.
3. In Project settings, paste
[`PROJECT_INSTRUCTIONS.md`](https://github.com/Arcadesys/furry-image-studio/blob/main/chatgpt/PROJECT_INSTRUCTIONS.md)
into the project instructions.
4. Start transformation chats inside that Project. It becomes a durable
   character library: profiles are resolved by their name or alias in natural
   language.

### ChatGPT Android use

Open that same Project in the Android app. Attach the real photo and any
character-reference images, then say what you want naturally—for example,
“Turn me into Testy Taupin in Toon in Real World style.”
[`MOBILE_QUICKSTART.md`](https://github.com/Arcadesys/furry-image-studio/blob/main/chatgpt/MOBILE_QUICKSTART.md)
has the short setup and ready-to-use starters. When a new character is added or
revised in the Project, ChatGPT returns a replacement library entry; paste it
into the project file to make the exact canon durable.

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
The root `assets/`, `skills/`, manifest, and README are the canonical authoring
copy and must match their counterparts in that package. The eval recorder is
the intentional exception: the root `scripts/record_eval_run.mjs` is a thin
development wrapper, while the release package contains the self-contained
implementation used by an installed plugin. `python3 scripts/test_plugin.py`
verifies that the mirrored files stay identical and that both recorder entry
points expose the same CLI, so a change cannot silently split their behavior.

### Profiles and skills

- `assets/characters/<id>/character.md` defines one character's identity:
  species, locked traits, reference images, paw style, and finger count.
- `assets/styles/<id>.md` defines rendering behavior. Styles never replace a
  character's identity.
- `skills/*/SKILL.md` tells the harness when and how to add profiles, generate
  art, transform a selected subject in a photo, or repair one named defect.
- `scripts/new_character.py` and `scripts/new_style.py` create valid profile
  starters; `scripts/validate_profiles.py` validates their frontmatter.

Testy Taupin and the included styles are examples, not limits. Users can add any
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
the mirrored release files, and the eval recorder's development/installed CLI
contract. GitHub Actions runs the same checks on pushes and pull requests.

## Evaluate accepted images consistently

Furry Image Studio evaluates existing, accepted source/output pairs; it never
generates an image just to make an eval. From this checkout, use:

```bash
npm run eval:record -- --repo "$PWD" --source <actual-input.png> \
  --output <accepted-output.png> --title "<claim>" \
  --prompt-file <exact-sent-prompt.txt> --character <id> --style <id>
```

The recorder creates an immutable, checksum-backed review run. Human reviewers
score character fidelity plus story beat, composition hierarchy,
character-specific acting, physical integration, and source preservation before
the blind Codex judge is calibrated. See
[the eval protocol](evals/EVAL_PROTOCOL.md) for the small-set recipe, evidence
rules, and review-to-judge flow.

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
