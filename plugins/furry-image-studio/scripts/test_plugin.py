#!/usr/bin/env python3
"""Release-contract tests for the public Furry Image Studio plugin."""

from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import unittest


PLUGIN_ROOT = pathlib.Path(__file__).resolve().parents[1]
REPOSITORY_ROOT = PLUGIN_ROOT if (PLUGIN_ROOT / ".agents").is_dir() else PLUGIN_ROOT.parents[1]
PACKAGE = REPOSITORY_ROOT / "plugins" / "furry-image-studio"
if not PACKAGE.is_dir():
    PACKAGE = PLUGIN_ROOT
MARKETPLACE = REPOSITORY_ROOT / ".agents" / "plugins" / "marketplace.json"
RELEASE_PATHS = ("README.md", ".codex-plugin", "assets", "scripts", "skills")


def files_under(directory: pathlib.Path) -> dict[pathlib.Path, bytes]:
    return {
        path.relative_to(directory): path.read_bytes()
        for path in sorted(directory.rglob("*"))
        if path.is_file() and "__pycache__" not in path.parts
    }


class PluginReleaseContractTests(unittest.TestCase):
    def test_marketplace_points_to_the_release_package(self) -> None:
        if not MARKETPLACE.is_file():
            self.skipTest("standalone installed plugin has no repository marketplace")
        marketplace = json.loads(MARKETPLACE.read_text(encoding="utf-8"))
        self.assertEqual(marketplace["name"], "furry-image-studio")
        self.assertEqual(len(marketplace["plugins"]), 1)
        entry = marketplace["plugins"][0]
        self.assertEqual(entry["name"], "furry-image-studio")
        self.assertEqual(entry["source"], {"source": "local", "path": "./plugins/furry-image-studio"})
        self.assertEqual(entry["policy"], {"installation": "AVAILABLE", "authentication": "ON_INSTALL"})

    def test_manifest_declares_the_packaged_skills(self) -> None:
        manifest = json.loads((PACKAGE / ".codex-plugin" / "plugin.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["name"], "furry-image-studio")
        self.assertTrue(manifest["version"])
        self.assertEqual(manifest["skills"], "./skills/")
        self.assertTrue(manifest["description"])
        self.assertTrue(manifest["interface"]["displayName"])
        self.assertGreaterEqual(len(list((PACKAGE / "skills").glob("*/SKILL.md"))), 1)

    def test_authoring_copy_matches_the_release_package(self) -> None:
        if PLUGIN_ROOT == PACKAGE:
            self.skipTest("standalone installed plugin has no separate authoring copy")
        for relative_path in RELEASE_PATHS:
            source = REPOSITORY_ROOT / relative_path
            release = PACKAGE / relative_path
            self.assertTrue(source.exists(), source)
            self.assertTrue(release.exists(), release)
            if source.is_file():
                self.assertEqual(source.read_bytes(), release.read_bytes(), relative_path)
            else:
                self.assertEqual(files_under(source), files_under(release), relative_path)

    def test_skills_have_required_metadata(self) -> None:
        for skill in sorted((PACKAGE / "skills").glob("*/SKILL.md")):
            text = skill.read_text(encoding="utf-8")
            self.assertTrue(text.startswith("---\n"), skill)
            frontmatter, separator, _ = text[4:].partition("\n---\n")
            self.assertTrue(separator, skill)
            self.assertRegex(frontmatter, r"(?m)^name: [a-z0-9-]+$")
            self.assertRegex(frontmatter, r"(?m)^description: .+")

    def test_profile_validation_and_helper_entry_points(self) -> None:
        roots = (REPOSITORY_ROOT, PACKAGE) if REPOSITORY_ROOT != PACKAGE else (PACKAGE,)
        for plugin_root in roots:
            validation = subprocess.run(
                [sys.executable, "scripts/validate_profiles.py"],
                cwd=plugin_root,
                capture_output=True,
                text=True,
            )
            self.assertEqual(validation.returncode, 0, validation.stderr)
            self.assertIn("Profile validation passed.", validation.stdout)
            for script in ("new_character.py", "new_style.py"):
                help_result = subprocess.run(
                    [sys.executable, f"scripts/{script}", "--help"],
                    cwd=plugin_root,
                    capture_output=True,
                    text=True,
                )
                self.assertEqual(help_result.returncode, 0, help_result.stderr)


if __name__ == "__main__":
    unittest.main(verbosity=2)
