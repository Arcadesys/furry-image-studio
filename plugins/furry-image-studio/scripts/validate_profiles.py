#!/usr/bin/env python3
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def parse_frontmatter(path: pathlib.Path) -> dict:
    text = path.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        raise ValueError(f"{path}: missing YAML-style frontmatter")
    end = text.find("\n---\n", 4)
    if end == -1:
        raise ValueError(f"{path}: unterminated frontmatter")
    data: dict[str, object] = {}
    current_key: str | None = None
    for raw in text[4:end].splitlines():
        line = raw.rstrip()
        if not line:
            continue
        if line.startswith("  - "):
            if current_key is None:
                raise ValueError(f"{path}: list item without a key: {line}")
            data.setdefault(current_key, [])
            assert isinstance(data[current_key], list)
            data[current_key].append(line[4:])
            continue
        if ":" not in line:
            raise ValueError(f"{path}: unsupported frontmatter line: {line}")
        key, value = line.split(":", 1)
        current_key = key.strip()
        value = value.strip()
        if value:
            data[current_key] = value
        else:
            data[current_key] = []
    return data


def require(data: dict, path: pathlib.Path, fields: list[str]) -> list[str]:
    errors = []
    for field in fields:
        value = data.get(field)
        if value in (None, "", []):
            errors.append(f"{path}: missing required field {field}")
    return errors


def validate_character(path: pathlib.Path) -> list[str]:
    errors = []
    data = parse_frontmatter(path)
    errors += require(data, path, ["id", "display_name", "species", "required_traits"])
    traits = data.get("required_traits", [])
    refs = data.get("reference_images", [])
    if isinstance(traits, list) and len(traits) < 3:
        errors.append(f"{path}: required_traits should have at least 3 entries")
    paw_style = data.get("paw_style")
    if paw_style is not None and paw_style not in {
        "human-like-hands",
        "hybrid-hands",
        "full-paws",
    }:
        errors.append(
            f"{path}: paw_style must be human-like-hands, hybrid-hands, or full-paws"
        )
    finger_count = data.get("finger_count")
    if finger_count is not None and finger_count not in {"auto", "five", "toon-four"}:
        errors.append(f"{path}: finger_count must be auto, five, or toon-four")
    if isinstance(refs, list):
        for ref in refs:
            ref_path = path.parent / ref
            if not ref_path.exists():
                errors.append(f"{path}: reference image not found: {ref}")
    return errors


def validate_style(path: pathlib.Path) -> list[str]:
    errors = []
    data = parse_frontmatter(path)
    errors += require(data, path, ["id", "display_name", "default_scope", "allowed_scopes", "background_policy", "rendering", "avoid"])
    allowed = data.get("allowed_scopes", [])
    default = data.get("default_scope")
    if isinstance(allowed, list) and isinstance(default, str) and default not in allowed:
        errors.append(f"{path}: default_scope must be listed in allowed_scopes")
    return errors


def main() -> int:
    errors: list[str] = []
    for path in sorted((ASSETS / "characters").glob("*/character.md")):
        errors += validate_character(path)
    for path in sorted((ASSETS / "styles").glob("*.md")):
        errors += validate_style(path)
    if errors:
        print("\n".join(errors), file=sys.stderr)
        return 1
    print("Profile validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
