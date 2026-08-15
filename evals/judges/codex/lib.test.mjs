import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import {
  assignPartitions,
  codexArguments,
  compareAttempt,
  judgeSchemaForRubric,
  prepareCalibration,
  runJudgeAttempt,
  validateJudgeResponse,
  verifyBundle,
} from "./lib.mjs";

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

const rubric = [
  { id: "target-selection", label: "Target selection", passThreshold: 4 },
  { id: "paws-anatomy", label: "Paws / anatomy", passThreshold: 4 },
];

async function fixtureBundle(root, { corrupt = false } = {}) {
  const bundle = join(root, "bundle");
  await mkdir(join(bundle, "inputs"), { recursive: true });
  await mkdir(join(bundle, "outputs"), { recursive: true });
  const source = Buffer.from("source-image");
  const firstOutput = Buffer.from("first-output");
  const secondOutput = Buffer.from("second-output");
  await Promise.all([
    writeFile(join(bundle, "inputs", "01.png"), source),
    writeFile(join(bundle, "outputs", "01.png"), firstOutput),
    writeFile(join(bundle, "inputs", "02.png"), source),
    writeFile(join(bundle, "outputs", "02.png"), secondOutput),
  ]);
  const checksums = {
    "inputs/01.png": corrupt ? "0".repeat(64) : hash(source),
    "outputs/01.png": hash(firstOutput),
    "inputs/02.png": hash(source),
    "outputs/02.png": hash(secondOutput),
  };
  const review = {
    scores: { "target-selection": 5, "paws-anatomy": 3 },
    completed: true,
    updatedAt: "2026-07-29T12:00:00.000Z",
    annotations: [
      {
        assetRole: "output",
        x: 0.5,
        y: 0.7,
        category: "paws-anatomy",
        severity: "medium",
        note: "Extra digit",
      },
    ],
  };
  await writeFile(join(bundle, "manifest.json"), `${JSON.stringify({
    schemaVersion: 1,
    title: "Fixture",
    prompt: null,
    promptStatus: "missing",
    character: { id: "dog", snapshot: { species: "dog" } },
    style: { id: "toon-in-real-world", snapshot: { backgroundPolicy: "preserve" } },
    target: "only subject",
    rubric,
    traces: [
      {
        source: "inputs/01.png",
        output: "outputs/01.png",
        target: "only subject",
        notes: ["observed issue: this must stay blind"],
        review,
      },
      {
        source: "inputs/02.png",
        output: "outputs/02.png",
        target: "only subject",
        notes: [],
        review: { ...review, completed: false },
      },
    ],
    checksums,
  }, null, 2)}\n`);
  return bundle;
}

function judgeResponse(overrides = {}) {
  return {
    criteria: [
      {
        criterionId: "target-selection",
        assessability: "observable",
        score: 5,
        rationale: "Only target changed.",
      },
      {
        criterionId: "paws-anatomy",
        assessability: "observable",
        score: 4,
        rationale: "Minor paw defect.",
      },
    ],
    annotations: [
      {
        assetRole: "output",
        x: 0.54,
        y: 0.72,
        category: "paws-anatomy",
        severity: "medium",
        note: "Digit anatomy is uneven.",
      },
    ],
    overallAssessment: "Mostly passes.",
    confidence: 0.8,
    ...overrides,
  };
}

test("prepare verifies checksums and keeps human labels out of blind cases", async () => {
  const root = await mkdtemp(join(tmpdir(), "judge-test-"));
  try {
    const bundle = await fixtureBundle(root);
    const output = join(root, "prepared");
    const prepared = await prepareCalibration({
      bundleDir: bundle,
      outputDir: output,
      holdoutFraction: 0,
      now: () => new Date("2026-07-29T12:30:00.000Z"),
    });
    assert.equal(prepared.calibration.caseCount, 1);
    const entry = prepared.calibration.cases[0];
    const blind = JSON.parse(await readFile(join(output, entry.casePath), "utf8"));
    const gold = JSON.parse(await readFile(join(output, entry.goldPath), "utf8"));
    assert.equal(JSON.stringify(blind).includes("humanReview"), false);
    assert.equal(JSON.stringify(blind).includes("observed issue"), false);
    assert.equal(gold.humanReview.scores["paws-anatomy"], 3);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checksum corruption blocks calibration preparation", async () => {
  const root = await mkdtemp(join(tmpdir(), "judge-test-"));
  try {
    const bundle = await fixtureBundle(root, { corrupt: true });
    await assert.rejects(verifyBundle(bundle), /Checksum mismatch/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("judge response requires each rubric criterion exactly once", () => {
  assert.equal(validateJudgeResponse(judgeResponse(), rubric).criteria.length, 2);
  assert.throws(
    () => validateJudgeResponse(judgeResponse({ criteria: [judgeResponse().criteria[0]] }), rubric),
    /Missing judge score/,
  );
});

test("Codex command is ephemeral, isolated, structured, and image-aware", () => {
  const args = codexArguments({
    model: "gpt-test",
    workingDir: "/tmp/work",
    schemaPath: "/tmp/work/schema.json",
    resultPath: "/tmp/work/result.json",
    sourcePath: "/tmp/work/source.png",
    outputPath: "/tmp/work/output.png",
  });
  assert.deepEqual(args.slice(0, 5), [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
  ]);
  assert.equal(args.filter((value) => value === "--image").length, 2);
  assert.ok(args.includes("--output-schema"));
  assert.ok(args.includes("read-only"));
});

test("per-case schema constrains criterion and annotation categories", async () => {
  const base = JSON.parse(await readFile(new URL("./judge-output.schema.json", import.meta.url), "utf8"));
  const schema = judgeSchemaForRubric(base, rubric);
  assert.deepEqual(
    schema.properties.criteria.items.properties.criterionId.enum,
    ["target-selection", "paws-anatomy"],
  );
  assert.deepEqual(
    schema.properties.annotations.items.properties.category.enum,
    ["target-selection", "paws-anatomy"],
  );
});

test("holdout partition size is deterministic for small manual sets", () => {
  const cases = Array.from({ length: 6 }, (_, index) => ({
    caseId: `case-${index + 1}`,
  }));
  const first = assignPartitions(structuredClone(cases), 0.25);
  const second = assignPartitions(structuredClone(cases).reverse(), 0.25);
  const firstHoldout = first.filter((item) => item.partition === "holdout").map((item) => item.caseId).sort();
  const secondHoldout = second.filter((item) => item.partition === "holdout").map((item) => item.caseId).sort();
  assert.equal(firstHoldout.length, 2);
  assert.deepEqual(firstHoldout, secondHoldout);
});

test("attempt and comparison report score and pin agreement", async () => {
  const root = await mkdtemp(join(tmpdir(), "judge-test-"));
  try {
    const bundle = await fixtureBundle(root);
    const calibrationRoot = join(root, "prepared");
    const prepared = await prepareCalibration({
      bundleDir: bundle,
      outputDir: calibrationRoot,
      holdoutFraction: 0,
      now: () => new Date("2026-07-29T12:30:00.000Z"),
    });
    const fakeRunner = async (_command, args) => {
      const resultPath = args[args.indexOf("--output-last-message") + 1];
      await writeFile(resultPath, JSON.stringify(judgeResponse()));
      return { code: 0, signal: null, stdout: "", stderr: "" };
    };
    const attempt = await runJudgeAttempt({
      calibrationDir: prepared.root,
      model: "gpt-test",
      processRunner: fakeRunner,
      now: (() => {
        let tick = 0;
        return () => new Date(1785348000000 + tick++ * 1000);
      })(),
    });
    const comparison = await compareAttempt({
      calibrationDir: prepared.root,
      attemptDir: attempt.root,
    });
    assert.equal(attempt.attempt.succeeded, 1);
    assert.equal(comparison.report.totals.meanAbsoluteError, 0.5);
    assert.equal(comparison.report.totals.passFailAgreement, 0.5);
    assert.equal(comparison.report.totals.manualPinLocationRecall, 1);
    assert.equal(comparison.report.totals.strictManualPinRecall, 1);
    assert.equal(comparison.report.verdict, "insufficient-data");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
