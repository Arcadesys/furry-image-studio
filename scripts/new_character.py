#!/usr/bin/env python3
import argparse
import pathlib
import re


ROOT = pathlib.Path(__file__).resolve().parents[1]


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return re.sub(r"-+", "-", slug) or "character"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a furry character profile folder.")
    parser.add_argument("name")
    parser.add_argument("--species", required=True)
    parser.add_argument("--trait", action="append", default=[])
    parser.add_argument("--avoid", action="append", default=[])
    parser.add_argument(
        "--paw-style",
        default="hybrid-hands",
        choices=["human-like-hands", "hybrid-hands", "full-paws"],
    )
    parser.add_argument(
        "--finger-count",
        default="auto",
        choices=["auto", "five", "toon-four"],
    )
    parser.add_argument("--id")
    args = parser.parse_args()

    char_id = slugify(args.id or args.name)
    char_dir = ROOT / "assets" / "characters" / char_id
    refs_dir = char_dir / "references"
    refs_dir.mkdir(parents=True, exist_ok=True)

    traits = args.trait or [
        "describe the character's primary fur, feather, scale, or skin colors",
        "describe the character's face, muzzle, beak, horns, ears, or hair",
        "describe the character's required markings, accessories, or clothing",
    ]
    avoid = args.avoid or ["generic species design", "extra limbs or anatomy", "unwanted style drift"]

    profile = [
        "---",
        f"id: {char_id}",
        f"display_name: {args.name}",
        f"species: {args.species}",
        "body_type: anthropomorphic character",
        "default_style: toon-in-real-world",
        f"paw_style: {args.paw_style}",
        f"finger_count: {args.finger_count}",
        "required_traits:",
        *[f"  - {trait}" for trait in traits],
        "avoid:",
        *[f"  - {item}" for item in avoid],
        "reference_images: []",
        "---",
        "",
        f"# {args.name}",
        "",
        "Add reference images to `references/`, then list them in `reference_images`.",
        "",
    ]
    profile_path = char_dir / "character.md"
    if profile_path.exists():
        raise SystemExit(f"Refusing to overwrite existing profile: {profile_path}")
    profile_path.write_text("\n".join(profile), encoding="utf-8")
    print(profile_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
