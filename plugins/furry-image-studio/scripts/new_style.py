#!/usr/bin/env python3
import argparse
import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return re.sub(r"-+", "-", slug) or "style"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a furry image style profile.")
    parser.add_argument("name")
    parser.add_argument("--scope", default="full-image", choices=["subject-only", "full-image"])
    parser.add_argument("--background-policy", default="stylize-allowed")
    parser.add_argument("--rendering", action="append", default=[])
    parser.add_argument("--avoid", action="append", default=[])
    parser.add_argument("--id")
    args = parser.parse_args()

    style_id = slugify(args.id or args.name)
    style_path = ROOT / "assets" / "styles" / f"{style_id}.md"
    if style_path.exists():
        raise SystemExit(f"Refusing to overwrite existing style: {style_path}")

    rendering = args.rendering or [
        "describe line, shape, lighting, texture, and color behavior",
        "keep the character identity readable",
        "make the focal subject large and clear",
    ]
    avoid = args.avoid or ["style drift", "tiny unreadable detail", "losing character markings"]

    profile = [
        "---",
        f"id: {style_id}",
        f"display_name: {args.name}",
        f"default_scope: {args.scope}",
        "allowed_scopes:",
        f"  - {args.scope}",
        f"background_policy: {args.background_policy}",
        "rendering:",
        *[f"  - {item}" for item in rendering],
        "preserve:",
        "  - character identity",
        "  - required markings and accessories",
        "avoid:",
        *[f"  - {item}" for item in avoid],
        "---",
        "",
        f"# {args.name}",
        "",
        "Describe when to use this style.",
        "",
    ]
    style_path.write_text("\n".join(profile), encoding="utf-8")
    print(style_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
