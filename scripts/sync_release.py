#!/usr/bin/env python3
"""Synchronize canonical authoring files into the installable plugin package."""

from __future__ import annotations

import pathlib
import shutil
import subprocess


REPOSITORY_ROOT = pathlib.Path(__file__).resolve().parents[1]
PACKAGE = REPOSITORY_ROOT / "plugins" / "furry-image-studio"
MIRRORED_RELEASE_PATHS = ("README.md", ".codex-plugin", "assets", "skills")


def repository_files(*pathspecs: str) -> set[pathlib.Path]:
    """Return tracked and non-ignored untracked files for the given pathspecs."""
    result = subprocess.run(
        [
            "git",
            "ls-files",
            "--cached",
            "--others",
            "--exclude-standard",
            "--",
            *pathspecs,
        ],
        cwd=REPOSITORY_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    candidates = {pathlib.Path(line) for line in result.stdout.splitlines() if line}
    return {path for path in candidates if (REPOSITORY_ROOT / path).is_file()}


def main() -> None:
    source_files = repository_files(*MIRRORED_RELEASE_PATHS)
    package_prefix = pathlib.Path("plugins/furry-image-studio")
    package_pathspecs = [str(package_prefix / path) for path in MIRRORED_RELEASE_PATHS]
    packaged_files = repository_files(*package_pathspecs)

    expected_package_files = {package_prefix / path for path in source_files}
    stale_package_files = packaged_files - expected_package_files

    for relative_path in sorted(stale_package_files):
        destination = REPOSITORY_ROOT / relative_path
        if destination.exists():
            destination.unlink()
            print(f"removed stale {relative_path}")

    for relative_path in sorted(source_files):
        source = REPOSITORY_ROOT / relative_path
        destination = PACKAGE / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        print(f"synced {relative_path}")

    for mirrored_path in MIRRORED_RELEASE_PATHS:
        destination = PACKAGE / mirrored_path
        if destination.is_dir():
            for directory in sorted(
                destination.rglob("*"), key=lambda path: len(path.parts), reverse=True
            ):
                if directory.is_dir() and not any(directory.iterdir()):
                    directory.rmdir()


if __name__ == "__main__":
    main()
