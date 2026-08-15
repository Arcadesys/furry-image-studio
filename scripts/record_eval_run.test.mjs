import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { recordEvalRun } from "./record_eval_run.mjs";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "furry-eval-recorder-"));
  await mkdir(join(root, "apps", "trace-review"), { recursive: true });
  await writeFile(join(root, "apps", "trace-review", "PIPELINE.md"), "# Test contract\n");
  await mkdir(join(root, "assets", "characters", "test-fox"), { recursive: true });
  await writeFile(
    join(root, "assets", "characters", "test-fox", "character.md"),
    "---\nid: test-fox\nspecies: red fox\n---\n",
  );
  await mkdir(join(root, "assets", "styles"), { recursive: true });
  await writeFile(
    join(root, "assets", "styles", "toon-in-real-world.md"),
    "---\nid: toon-in-real-world\nbackground_policy: preserve-exactly\n---\n",
  );
  const source = join(root, "source.png");
  const output = join(root, "output.png");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#ffffff" },
  }).png().toFile(source);
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#ff5500" },
  }).png().toFile(output);
  return { root, source, output };
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

test("records an immutable checksum-backed canonical run", async () => {
  const { root, source, output } = await fixture();
  const spec = {
    schemaVersion: 1,
    title: "Codex fox trace",
    prompt: "Transform only the selected subject into the test fox.",
    characterId: "test-fox",
    styleId: "toon-in-real-world",
    target: "foreground subject",
    generation: {
      provider: "OpenAI imagegen",
      model: "test-model",
      quality: "high",
    },
    traces: [{
      source,
      output,
      notes: ["Recorded from Codex eval mode"],
      metadata: { lighting: "mixed indoor" },
    }],
  };

  const first = await recordEvalRun(spec, {
    repoRoot: root,
    now: () => new Date("2026-07-30T12:00:00.000Z"),
  });
  assert.equal(first.status, "recorded");
  assert.match(first.runId, /^run-[a-f0-9]{24}$/);
  assert.equal(first.traceIds.length, 1);

  const manifest = JSON.parse(await readFile(first.manifestPath, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.runId, first.runId);
  assert.equal(manifest.promptStatus, "recorded");
  assert.equal(manifest.character.id, "test-fox");
  assert.match(manifest.character.snapshot, /species: red fox/);
  assert.equal(manifest.style.id, "toon-in-real-world");
  assert.equal(manifest.traces[0].id, first.traceIds[0]);
  assert.equal(manifest.traces[0].metadata.generation.model, "test-model");
  assert.equal(manifest.traces[0].metadata.lighting, "mixed indoor");

  for (const [relativePath, expected] of Object.entries(manifest.checksums)) {
    assert.equal(digest(await readFile(join(first.runPath, relativePath))), expected);
  }

  const duplicate = await recordEvalRun(spec, { repoRoot: root });
  assert.equal(duplicate.status, "existing");
  assert.equal(duplicate.runPath, first.runPath);
  const outputDirectories = (await readdir(join(root, "evals", "outputs"), {
    withFileTypes: true,
  })).filter((entry) => entry.isDirectory() && !entry.name.startsWith("."));
  assert.equal(outputDirectories.length, 1);
});

test("changed evidence creates a distinct immutable run", async () => {
  const { root, source, output } = await fixture();
  const baseSpec = {
    title: "Codex fox trace",
    prompt: "Transform only the selected subject into the test fox.",
    characterId: "test-fox",
    styleId: "toon-in-real-world",
    traces: [{ source, output }],
  };
  const first = await recordEvalRun(baseSpec, { repoRoot: root });

  const replacement = join(root, "replacement.png");
  await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#222222" },
  }).png().toFile(replacement);
  const second = await recordEvalRun({
    ...baseSpec,
    traces: [{ source, output: replacement }],
  }, { repoRoot: root });

  assert.equal(second.status, "recorded");
  assert.notEqual(second.runId, first.runId);
  assert.notEqual(second.runPath, first.runPath);
});

test("preserves a missing historical prompt as explicitly unknown", async () => {
  const { root, source, output } = await fixture();
  const result = await recordEvalRun({
    title: "Historical Codex result",
    promptStatus: "missing",
    characterId: "test-fox",
    styleId: "toon-in-real-world",
    traces: [{ source, output }],
  }, { repoRoot: root });

  const manifest = JSON.parse(await readFile(result.manifestPath, "utf8"));
  assert.equal(manifest.prompt, null);
  assert.equal(manifest.promptStatus, "missing");
  assert.equal(await readFile(join(result.runPath, "prompt.txt"), "utf8"), "");
});
