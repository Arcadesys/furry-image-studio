# Repository workflow

The repository root is the canonical authoring copy. Before committing a change
to `README.md`, `.codex-plugin/`, `assets/`, or `skills/`, run:

```bash
make sync-release
make test
```

Commit the matching files under `plugins/furry-image-studio/` in the same
commit. Do not blanket-copy `scripts/`: the root eval recorder is intentionally
a thin development wrapper, while the packaged recorder is self-contained.
