import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createTraceReviewApp } from "../apps/trace-review/server/app.ts";
import { prepareCalibration } from "../evals/judges/codex/lib.mjs";
import { recordEvalRun } from "./record_eval_run.mjs";

test("Codex recording flows through review export into blind judge preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "furry-eval-flow-"));
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
  const output = join(root, "codex-output.png");
  await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#ffffff" },
  }).png().toFile(source);
  await sharp({
    create: { width: 12, height: 12, channels: 3, background: "#cc5500" },
  }).png().toFile(output);

  const recorded = await recordEvalRun({
    title: "Recorded Codex fox",
    prompt: "Transform only the subject into the test fox.",
    characterId: "test-fox",
    styleId: "toon-in-real-world",
    target: "only subject",
    generation: { provider: "OpenAI imagegen", model: "test-model" },
    traces: [{ source, output }],
  }, { repoRoot: root });

  const backend = await createTraceReviewApp({
    repoRoot: root,
    dataDir: join(root, ".review-data"),
    evalCasesDir: join(root, "evals", "cases"),
    logger: false,
  });
  try {
    const runs = backend.database.listRuns();
    assert.equal(runs.length, 1);
    assert.equal(runs[0]?.title, "Recorded Codex fox");
    const run = backend.database.getRun(runs[0]!.id);
    assert.equal(run?.traces.length, 1);
    assert.equal(run?.prompt, "Transform only the subject into the test fox.");
    assert.equal(run?.traces[0]?.sourceMetadata?.generation?.model, "test-model");

    const scores = Object.fromEntries(run!.rubric.map((criterion) => [criterion.id, 5]));
    const reviewResponse = await backend.app.inject({
      method: "PUT",
      url: `/api/traces/${run!.traces[0]!.id}/review`,
      payload: { scores, completed: true },
    });
    assert.equal(reviewResponse.statusCode, 200);

    const exportResponse = await backend.app.inject({
      method: "POST",
      url: `/api/runs/${run!.id}/export`,
    });
    assert.equal(exportResponse.statusCode, 201);
    const exported = exportResponse.json<{ exportPath: string }>();
    const prepared = await prepareCalibration({
      bundleDir: exported.exportPath,
      outputDir: join(root, "judge-run"),
      holdoutFraction: 0,
    });
    assert.equal(prepared.calibration.caseCount, 1);

    const blindCasePath = join(
      prepared.root,
      prepared.calibration.cases[0]!.casePath,
    );
    const blindCase = JSON.parse(await readFile(blindCasePath, "utf8"));
    assert.equal(blindCase.prompt, "Transform only the subject into the test fox.");
    assert.equal(blindCase.sourceMetadata.generation.model, "test-model");
    assert.equal("review" in blindCase, false);
  } finally {
    await backend.app.close();
  }

  assert.match(recorded.runPath, /evals\/outputs\/recorded-codex-fox-/);
});
