import { createHash } from "node:crypto";
import {
  constants as fsConstants,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const JUDGE_SCHEMA_VERSION = 1;
const moduleDir = dirname(fileURLToPath(import.meta.url));
export const defaultSchemaPath = join(moduleDir, "judge-output.schema.json");
export const defaultGuidancePath = join(moduleDir, "judge-guidance.md");
export const defaultPolicyPath = join(moduleDir, "policy.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return slug || "judge-run";
}

function timestamp(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.(\d{3})Z$/, "$1Z");
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

function assertString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function safeRelativePath(root, value, label) {
  if (typeof value !== "string" || !value || isAbsolute(value)) {
    throw new Error(`${label} must be a relative path.`);
  }
  const absolute = resolve(root, value);
  const relation = relative(root, absolute);
  if (relation === ".." || relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`${label} escapes its bundle.`);
  }
  return absolute;
}

async function writeJsonExclusive(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
}

async function copyExclusive(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination, fsConstants.COPYFILE_EXCL);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function assignPartitions(cases, holdoutFraction) {
  for (const item of cases) item.partition = "calibration";
  if (holdoutFraction <= 0 || cases.length < 4) return cases;
  const holdoutCount = Math.min(
    cases.length - 1,
    Math.max(1, Math.round(cases.length * holdoutFraction)),
  );
  const selected = [...cases]
    .sort((a, b) => sha256(a.caseId).localeCompare(sha256(b.caseId)))
    .slice(0, holdoutCount);
  for (const item of selected) item.partition = "holdout";
  return cases;
}

export async function verifyBundle(bundleDir) {
  const manifestPath = join(bundleDir, "manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = assertObject(JSON.parse(manifestBytes.toString("utf8")), "manifest");
  if (manifest.schemaVersion !== 1) {
    throw new Error(`Unsupported eval bundle schema version: ${manifest.schemaVersion}`);
  }
  if (!Array.isArray(manifest.rubric) || manifest.rubric.length === 0) {
    throw new Error("Eval bundle rubric is missing.");
  }
  if (!Array.isArray(manifest.traces)) {
    throw new Error("Eval bundle traces are missing.");
  }
  const checksums = assertObject(manifest.checksums, "manifest.checksums");
  for (const [relativePath, expected] of Object.entries(checksums)) {
    const filePath = safeRelativePath(bundleDir, relativePath, `checksum path ${relativePath}`);
    const actual = sha256(await readFile(filePath));
    if (actual !== expected) {
      throw new Error(`Checksum mismatch for ${relativePath}.`);
    }
  }
  return {
    manifest,
    manifestSha256: sha256(manifestBytes),
  };
}

export function validateJudgeResponse(response, rubric) {
  const result = assertObject(response, "judge response");
  if (!Array.isArray(result.criteria)) throw new Error("Judge criteria must be an array.");
  if (!Array.isArray(result.annotations)) throw new Error("Judge annotations must be an array.");
  if (typeof result.overallAssessment !== "string" || !result.overallAssessment.trim()) {
    throw new Error("Judge overallAssessment is required.");
  }
  if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) {
    throw new Error("Judge confidence must be between 0 and 1.");
  }

  const rubricIds = new Set(rubric.map((criterion) => criterion.id));
  const seen = new Set();
  for (const criterion of result.criteria) {
    assertObject(criterion, "judge criterion");
    if (!rubricIds.has(criterion.criterionId) || seen.has(criterion.criterionId)) {
      throw new Error(`Unexpected or duplicate criterion: ${criterion.criterionId}`);
    }
    if (!["observable", "partially-observable", "not-observable"].includes(criterion.assessability)) {
      throw new Error(`Invalid assessability for ${criterion.criterionId}.`);
    }
    if (!Number.isInteger(criterion.score) || criterion.score < 1 || criterion.score > 5) {
      throw new Error(`Invalid score for ${criterion.criterionId}.`);
    }
    assertString(criterion.rationale, `rationale for ${criterion.criterionId}`);
    seen.add(criterion.criterionId);
  }
  for (const criterionId of rubricIds) {
    if (!seen.has(criterionId)) throw new Error(`Missing judge score for ${criterionId}.`);
  }

  for (const annotation of result.annotations) {
    assertObject(annotation, "judge annotation");
    if (!["source", "output"].includes(annotation.assetRole)) {
      throw new Error("Judge annotation assetRole is invalid.");
    }
    if (!rubricIds.has(annotation.category)) {
      throw new Error(`Judge annotation category is invalid: ${annotation.category}`);
    }
    if (!["low", "medium", "high"].includes(annotation.severity)) {
      throw new Error("Judge annotation severity is invalid.");
    }
    if (
      typeof annotation.x !== "number"
      || typeof annotation.y !== "number"
      || annotation.x < 0
      || annotation.x > 1
      || annotation.y < 0
      || annotation.y > 1
    ) {
      throw new Error("Judge annotation coordinates must be normalized.");
    }
    assertString(annotation.note, "judge annotation note");
  }
  return result;
}

export async function prepareCalibration({
  bundleDir,
  outputDir,
  holdoutFraction = 0.25,
  now = () => new Date(),
}) {
  if (holdoutFraction < 0 || holdoutFraction >= 1) {
    throw new Error("holdoutFraction must be at least 0 and less than 1.");
  }
  const absoluteBundle = resolve(bundleDir);
  const { manifest, manifestSha256 } = await verifyBundle(absoluteBundle);
  const completed = manifest.traces
    .map((trace, index) => ({ trace, index }))
    .filter(({ trace }) => trace.review?.completed === true);
  if (completed.length === 0) {
    throw new Error("The bundle has no completed human reviews.");
  }

  const preparedAt = now().toISOString();
  const defaultRoot = resolve(
    ".furry-image-studio",
    "judge-runs",
    `${timestamp(now())}-${slugify(manifest.title ?? "judge-run")}`,
  );
  const root = resolve(outputDir ?? defaultRoot);
  await mkdir(dirname(root), { recursive: true });
  await mkdir(root, { recursive: false });

  const cases = [];
  try {
    for (const { trace, index } of completed) {
      const sourcePath = safeRelativePath(absoluteBundle, trace.source, `trace ${index + 1} source`);
      const outputPath = safeRelativePath(absoluteBundle, trace.output, `trace ${index + 1} output`);
      const sourceBytes = await readFile(sourcePath);
      const outputBytes = await readFile(outputPath);
      if (manifest.checksums[trace.source] !== sha256(sourceBytes)) {
        throw new Error(`Completed trace ${index + 1} source is not checksum-verified.`);
      }
      if (manifest.checksums[trace.output] !== sha256(outputBytes)) {
        throw new Error(`Completed trace ${index + 1} output is not checksum-verified.`);
      }
      for (const criterion of manifest.rubric) {
        const score = trace.review.scores?.[criterion.id];
        if (!Number.isInteger(score) || score < 1 || score > 5) {
          throw new Error(`Completed trace ${index + 1} is missing score ${criterion.id}.`);
        }
      }
      const caseId = `case-${sha256(
        `${manifestSha256}:${index + 1}:${sha256(sourceBytes)}:${sha256(outputBytes)}`,
      ).slice(0, 24)}`;
      const caseDir = join(root, "cases", caseId);
      const sourceName = `source${extname(trace.source).toLowerCase()}`;
      const outputName = `output${extname(trace.output).toLowerCase()}`;
      await mkdir(caseDir, { recursive: true });
      await copyExclusive(sourcePath, join(caseDir, sourceName));
      await copyExclusive(outputPath, join(caseDir, outputName));

      const blindCase = {
        schemaVersion: JUDGE_SCHEMA_VERSION,
        caseId,
        title: manifest.title,
        ordinal: index + 1,
        prompt: manifest.prompt,
        promptStatus: manifest.promptStatus,
        character: manifest.character,
        style: manifest.style,
        target: trace.target ?? manifest.target,
        rubric: manifest.rubric,
        sourceMetadata: trace.metadata ?? null,
        source: {
          file: sourceName,
          sha256: sha256(sourceBytes),
        },
        output: {
          file: outputName,
          sha256: sha256(outputBytes),
        },
      };
      const gold = {
        schemaVersion: JUDGE_SCHEMA_VERSION,
        caseId,
        humanReview: trace.review,
      };
      await writeJsonExclusive(join(caseDir, "case.json"), blindCase);
      await writeJsonExclusive(join(root, "gold", `${caseId}.json`), gold);
      cases.push({
        caseId,
        ordinal: index + 1,
        partition: "calibration",
        casePath: `cases/${caseId}/case.json`,
        goldPath: `gold/${caseId}.json`,
      });
    }
    assignPartitions(cases, holdoutFraction);
    const calibration = {
      schemaVersion: JUDGE_SCHEMA_VERSION,
      type: "codex-image-judge-calibration",
      preparedAt,
      sourceBundle: {
        title: manifest.title,
        manifestSha256,
      },
      rubric: manifest.rubric,
      holdoutFraction,
      caseCount: cases.length,
      cases,
    };
    await writeJsonExclusive(join(root, "calibration.json"), calibration);
    return { root, calibration };
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}

export function buildJudgePrompt(blindCase, guidance) {
  return [
    guidance.trim(),
    "",
    "## Blind Case",
    "",
    "Image 1 is the source. Image 2 is the transformed output.",
    "The human review is intentionally unavailable. Do not inspect the filesystem,",
    "call tools, or seek any other labels. Judge only the two attached images and",
    "the frozen case contract below.",
    "",
    "Return every rubric criterion exactly once using its criterion ID.",
    "",
    "```json",
    JSON.stringify(blindCase, null, 2),
    "```",
  ].join("\n");
}

export function judgeSchemaForRubric(baseSchema, rubric) {
  const schema = structuredClone(baseSchema);
  const criterionIds = rubric.map((criterion) => criterion.id);
  schema.properties.criteria.items.properties.criterionId.enum = criterionIds;
  schema.properties.annotations.items.properties.category.enum = criterionIds;
  return schema;
}

export function codexArguments({
  model,
  workingDir,
  schemaPath,
  resultPath,
  sourcePath,
  outputPath,
}) {
  return [
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--skip-git-repo-check",
    "--sandbox",
    "read-only",
    "--color",
    "never",
    "--model",
    model,
    "--cd",
    workingDir,
    "--output-schema",
    schemaPath,
    "--output-last-message",
    resultPath,
    "--image",
    sourcePath,
    "--image",
    outputPath,
    "-",
  ];
}

async function runProcess(command, args, { cwd, stdin = "" } = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      resolvePromise({ code, signal, stdout, stderr });
    });
    child.stdin.end(stdin);
  });
}

async function codexVersion(codexBin) {
  const result = await runProcess(codexBin, ["--version"]);
  if (result.code !== 0) throw new Error(`Unable to run ${codexBin}: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

async function runWithConcurrency(items, concurrency, worker) {
  const queue = [...items];
  const results = [];
  const runners = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      results.push(await worker(item));
    }
  });
  await Promise.all(runners);
  return results;
}

export async function runJudgeAttempt({
  calibrationDir,
  model,
  partition = "all",
  caseIds = [],
  concurrency = 1,
  codexBin = "codex",
  guidancePath = defaultGuidancePath,
  now = () => new Date(),
  processRunner = runProcess,
}) {
  assertString(model, "model");
  if (!["all", "calibration", "holdout"].includes(partition)) {
    throw new Error("partition must be all, calibration, or holdout.");
  }
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) {
    throw new Error("concurrency must be 1 or 2.");
  }
  const root = resolve(calibrationDir);
  const calibration = await readJson(join(root, "calibration.json"));
  const requested = new Set(caseIds);
  const selected = calibration.cases.filter((item) => (
    (partition === "all" || item.partition === partition)
    && (requested.size === 0 || requested.has(item.caseId))
  ));
  if (selected.length === 0) throw new Error("No judge cases matched the requested selection.");
  if (requested.size > 0 && selected.length !== requested.size) {
    throw new Error("One or more requested case IDs were not found in the selected partition.");
  }

  const guidance = await readFile(resolve(guidancePath), "utf8");
  const guidanceSha256 = sha256(guidance);
  const startedAt = now().toISOString();
  const attemptRoot = join(
    root,
    "attempts",
    `${timestamp(now())}-${slugify(model)}-${partition}`,
  );
  await mkdir(dirname(attemptRoot), { recursive: true });
  await mkdir(attemptRoot, { recursive: false });
  await writeFile(join(attemptRoot, "guidance.md"), guidance, { flag: "wx" });
  const version = processRunner === runProcess ? await codexVersion(codexBin) : "test-codex";

  const outcomes = await runWithConcurrency(selected, concurrency, async (entry) => {
    const blindCase = await readJson(join(root, entry.casePath));
    const caseDir = dirname(join(root, entry.casePath));
    const sourcePath = join(caseDir, blindCase.source.file);
    const outputPath = join(caseDir, blindCase.output.file);
    const workDir = await mkdtemp(join(tmpdir(), "furry-codex-judge-"));
    const tempSource = join(workDir, `source${extname(sourcePath)}`);
    const tempOutput = join(workDir, `output${extname(outputPath)}`);
    const tempSchema = join(workDir, "judge-output.schema.json");
    const resultPath = join(workDir, "result.json");
    const caseStarted = Date.now();
    try {
      await Promise.all([
        copyFile(sourcePath, tempSource),
        copyFile(outputPath, tempOutput),
        readJson(defaultSchemaPath).then((schema) => writeFile(
          tempSchema,
          `${JSON.stringify(judgeSchemaForRubric(schema, blindCase.rubric), null, 2)}\n`,
          { flag: "wx" },
        )),
      ]);
      const prompt = buildJudgePrompt(blindCase, guidance);
      const args = codexArguments({
        model,
        workingDir: workDir,
        schemaPath: tempSchema,
        resultPath,
        sourcePath: tempSource,
        outputPath: tempOutput,
      });
      const processResult = await processRunner(codexBin, args, { cwd: workDir, stdin: prompt });
      if (processResult.code !== 0) {
        throw new Error(
          `Codex exited ${processResult.code}${processResult.signal ? ` (${processResult.signal})` : ""}: `
          + `${processResult.stderr.trim() || processResult.stdout.trim()}`,
        );
      }
      const response = validateJudgeResponse(await readJson(resultPath), blindCase.rubric);
      const envelope = {
        schemaVersion: JUDGE_SCHEMA_VERSION,
        caseId: entry.caseId,
        partition: entry.partition,
        judge: "codex",
        model,
        codexVersion: version,
        guidanceSha256,
        blindCaseSha256: sha256(await readFile(join(root, entry.casePath))),
        sourceSha256: blindCase.source.sha256,
        outputSha256: blindCase.output.sha256,
        startedAt: new Date(caseStarted).toISOString(),
        completedAt: now().toISOString(),
        durationMs: Date.now() - caseStarted,
        response,
      };
      await writeJsonExclusive(join(attemptRoot, "results", `${entry.caseId}.json`), envelope);
      return { caseId: entry.caseId, status: "succeeded" };
    } catch (error) {
      const failure = {
        schemaVersion: JUDGE_SCHEMA_VERSION,
        caseId: entry.caseId,
        partition: entry.partition,
        model,
        failedAt: now().toISOString(),
        message: error instanceof Error ? error.message : String(error),
      };
      await writeJsonExclusive(join(attemptRoot, "errors", `${entry.caseId}.json`), failure);
      return { caseId: entry.caseId, status: "failed", message: failure.message };
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  const attempt = {
    schemaVersion: JUDGE_SCHEMA_VERSION,
    type: "codex-image-judge-attempt",
    model,
    codexVersion: version,
    partition,
    guidanceSha256,
    startedAt,
    completedAt: now().toISOString(),
    caseCount: selected.length,
    succeeded: outcomes.filter((item) => item.status === "succeeded").length,
    failed: outcomes.filter((item) => item.status === "failed").length,
    outcomes,
  };
  await writeJsonExclusive(join(attemptRoot, "attempt.json"), attempt);
  return { root: attemptRoot, attempt };
}

function safeRate(numerator, denominator) {
  return denominator === 0 ? null : numerator / denominator;
}

function round(value, digits = 4) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Number(value.toFixed(digits));
}

function pinDistance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function matchPins(humanPins, judgePins, radius, requireCategory) {
  const candidates = [];
  for (const [humanIndex, human] of humanPins.entries()) {
    for (const [judgeIndex, judge] of judgePins.entries()) {
      if (
        human.assetRole !== judge.assetRole
        || (requireCategory && human.category !== judge.category)
      ) continue;
      const distance = pinDistance(human, judge);
      if (distance <= radius) candidates.push({ humanIndex, judgeIndex, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance);
  const usedHuman = new Set();
  const usedJudge = new Set();
  const matches = [];
  for (const candidate of candidates) {
    if (usedHuman.has(candidate.humanIndex) || usedJudge.has(candidate.judgeIndex)) continue;
    usedHuman.add(candidate.humanIndex);
    usedJudge.add(candidate.judgeIndex);
    matches.push(candidate);
  }
  return {
    matches,
    unmatchedHuman: humanPins.length - usedHuman.size,
    unmatchedJudge: judgePins.length - usedJudge.size,
  };
}

function aggregateComparisons(caseReports, rubric, policy) {
  const allScoreRows = caseReports.flatMap((item) => item.criteria);
  const scoreRows = allScoreRows.filter((item) => item.includedInScoreMetrics);
  const pinRows = caseReports.flatMap((item) => item.pinMatches);
  const humanPins = caseReports.reduce((total, item) => total + item.humanPinCount, 0);
  const judgePins = caseReports.reduce((total, item) => total + item.judgePinCount, 0);
  const locationMatchedPins = pinRows.length;
  const strictMatchedPins = caseReports.reduce(
    (total, item) => total + item.strictPinMatchCount,
    0,
  );
  const totals = {
    casesCompared: caseReports.length,
    criteriaPresented: allScoreRows.length,
    scoreComparisons: scoreRows.length,
    criterionCoverage: round(safeRate(scoreRows.length, allScoreRows.length)),
    meanAbsoluteError: round(
      safeRate(scoreRows.reduce((sum, row) => sum + row.absoluteError, 0), scoreRows.length),
    ),
    exactScoreAgreement: round(safeRate(
      scoreRows.filter((row) => row.absoluteError === 0).length,
      scoreRows.length,
    )),
    withinOneRate: round(safeRate(
      scoreRows.filter((row) => row.absoluteError <= 1).length,
      scoreRows.length,
    )),
    passFailAgreement: round(safeRate(
      scoreRows.filter((row) => row.passAgreement).length,
      scoreRows.length,
    )),
    casePassAgreement: round(safeRate(
      caseReports.filter((item) => item.passAgreement).length,
      caseReports.length,
    )),
    humanPinCount: humanPins,
    judgePinCount: judgePins,
    locationMatchedManualPins: locationMatchedPins,
    strictMatchedManualPins: strictMatchedPins,
    manualPinLocationRecall: round(safeRate(locationMatchedPins, humanPins)),
    strictManualPinRecall: round(safeRate(strictMatchedPins, humanPins)),
    pinCategoryAgreement: round(safeRate(
      pinRows.filter((item) => item.categoryAgreement).length,
      pinRows.length,
    )),
    extraJudgePins: Math.max(0, judgePins - locationMatchedPins),
    meanMatchedPinDistance: round(safeRate(
      pinRows.reduce((sum, item) => sum + item.distance, 0),
      pinRows.length,
    )),
    pinSeverityAgreement: round(safeRate(
      pinRows.filter((item) => item.severityAgreement).length,
      pinRows.length,
    )),
  };
  const byCriterion = rubric.map((criterion) => {
    const rows = scoreRows.filter((row) => row.criterionId === criterion.id);
    return {
      criterionId: criterion.id,
      label: criterion.label,
      presented: allScoreRows.filter((row) => row.criterionId === criterion.id).length,
      comparisons: rows.length,
      coverage: round(safeRate(
        rows.length,
        allScoreRows.filter((row) => row.criterionId === criterion.id).length,
      )),
      meanAbsoluteError: round(safeRate(
        rows.reduce((sum, row) => sum + row.absoluteError, 0),
        rows.length,
      )),
      passFailAgreement: round(safeRate(
        rows.filter((row) => row.passAgreement).length,
        rows.length,
      )),
    };
  });

  const enoughCases = totals.casesCompared >= policy.minimumCases;
  const pinGatePasses = totals.humanPinCount === 0
    || (totals.manualPinLocationRecall ?? 0) >= policy.minimumManualPinLocationRecall;
  const pinCategoryGatePasses = totals.locationMatchedManualPins === 0
    ? totals.humanPinCount === 0
    : (totals.pinCategoryAgreement ?? 0) >= policy.minimumPinCategoryAgreement;
  const gates = {
    enoughCases,
    criterionCoverage: totals.criterionCoverage !== null
      && totals.criterionCoverage >= policy.minimumCriterionCoverage,
    meanAbsoluteError: totals.meanAbsoluteError !== null
      && totals.meanAbsoluteError <= policy.maximumMeanAbsoluteError,
    withinOneRate: totals.withinOneRate !== null
      && totals.withinOneRate >= policy.minimumWithinOneRate,
    passFailAgreement: totals.passFailAgreement !== null
      && totals.passFailAgreement >= policy.minimumPassFailAgreement,
    casePassAgreement: totals.casePassAgreement !== null
      && totals.casePassAgreement >= policy.minimumCasePassAgreement,
    manualPinLocationRecall: pinGatePasses,
    pinCategoryAgreement: pinCategoryGatePasses,
  };
  const verdict = !enoughCases
    ? "insufficient-data"
    : Object.values(gates).every(Boolean)
      ? "calibrated"
      : "needs-calibration";
  return { totals, byCriterion, gates, verdict };
}

function markdownReport(report) {
  const percent = (value) => value === null ? "n/a" : `${(value * 100).toFixed(1)}%`;
  const number = (value) => value === null ? "n/a" : value.toFixed(3);
  const lines = [
    "# Codex Judge Agreement Report",
    "",
    `**Verdict:** ${report.verdict}`,
    "",
    `- Cases compared: ${report.totals.casesCompared}`,
    `- Observable criterion coverage: ${percent(report.totals.criterionCoverage)}`,
    `- Mean absolute score error: ${number(report.totals.meanAbsoluteError)}`,
    `- Scores within one point: ${percent(report.totals.withinOneRate)}`,
    `- Criterion pass/fail agreement: ${percent(report.totals.passFailAgreement)}`,
    `- Whole-case pass agreement: ${percent(report.totals.casePassAgreement)}`,
    `- Manual pin location recall: ${percent(report.totals.manualPinLocationRecall)}`,
    `- Strict pin recall (location + category): ${percent(report.totals.strictManualPinRecall)}`,
    `- Pin category agreement: ${percent(report.totals.pinCategoryAgreement)}`,
    `- Extra judge pins: ${report.totals.extraJudgePins}`,
    "",
    "## Criteria",
    "",
    "| Criterion | Coverage | Comparisons | MAE | Pass agreement |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...report.byCriterion.map((item) => (
      `| ${item.label} | ${percent(item.coverage)} | ${item.comparisons} | `
      + `${number(item.meanAbsoluteError)} | `
      + `${percent(item.passFailAgreement)} |`
    )),
    "",
    "## Cases",
    "",
    "| Case | Partition | Coverage | MAE | Pass agreement | Manual pins located |",
    "| --- | --- | ---: | ---: | --- | ---: |",
    ...report.cases.map((item) => (
      `| ${item.caseId} | ${item.partition} | ${percent(item.criterionCoverage)} | `
      + `${number(item.meanAbsoluteError)} | `
      + `${item.passAgreement ? "yes" : "no"} | ${item.pinMatches.length}/${item.humanPinCount} |`
    )),
    "",
  ];
  return `${lines.join("\n")}\n`;
}

export async function compareAttempt({
  calibrationDir,
  attemptDir,
  policyPath = defaultPolicyPath,
  partition = null,
}) {
  const calibrationRoot = resolve(calibrationDir);
  const attemptRoot = resolve(attemptDir);
  const [calibration, attempt, policy] = await Promise.all([
    readJson(join(calibrationRoot, "calibration.json")),
    readJson(join(attemptRoot, "attempt.json")),
    readJson(resolve(policyPath)),
  ]);
  const cases = [];
  for (const entry of calibration.cases) {
    if (partition && entry.partition !== partition) continue;
    let envelope;
    try {
      envelope = await readJson(join(attemptRoot, "results", `${entry.caseId}.json`));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    const [blindCase, gold] = await Promise.all([
      readJson(join(calibrationRoot, entry.casePath)),
      readJson(join(calibrationRoot, entry.goldPath)),
    ]);
    validateJudgeResponse(envelope.response, blindCase.rubric);
    const judgeScores = new Map(
      envelope.response.criteria.map((criterion) => [criterion.criterionId, criterion]),
    );
    const criteria = blindCase.rubric.map((criterion) => {
      const humanScore = gold.humanReview.scores[criterion.id];
      const judge = judgeScores.get(criterion.id);
      if (!Number.isInteger(humanScore)) {
        throw new Error(`Gold score is missing for ${entry.caseId}/${criterion.id}.`);
      }
      return {
        criterionId: criterion.id,
        label: criterion.label,
        passThreshold: criterion.passThreshold,
        assessability: judge.assessability,
        includedInScoreMetrics: judge.assessability !== "not-observable",
        humanScore,
        judgeScore: judge.score,
        judgeRationale: judge.rationale,
        absoluteError: Math.abs(humanScore - judge.score),
        humanPass: humanScore >= criterion.passThreshold,
        judgePass: judge.score >= criterion.passThreshold,
        passAgreement: (humanScore >= criterion.passThreshold) === (judge.score >= criterion.passThreshold),
      };
    });
    const locationPinResult = matchPins(
      gold.humanReview.annotations ?? [],
      envelope.response.annotations,
      policy.pinMatchRadius,
      false,
    );
    const strictPinResult = matchPins(
      gold.humanReview.annotations ?? [],
      envelope.response.annotations,
      policy.pinMatchRadius,
      true,
    );
    const pinMatches = locationPinResult.matches.map((match) => {
      const human = gold.humanReview.annotations[match.humanIndex];
      const judge = envelope.response.annotations[match.judgeIndex];
      return {
        humanIndex: match.humanIndex,
        judgeIndex: match.judgeIndex,
        assetRole: human.assetRole,
        category: human.category,
        distance: round(match.distance),
        humanCategory: human.category,
        judgeCategory: judge.category,
        categoryAgreement: human.category === judge.category,
        humanSeverity: human.severity,
        judgeSeverity: judge.severity,
        severityAgreement: human.severity === judge.severity,
      };
    });
    const scoredCriteria = criteria.filter((item) => item.includedInScoreMetrics);
    const judgeOverallPass = scoredCriteria.every((item) => item.judgePass);
    const comparableHumanOverallPass = scoredCriteria.every((item) => item.humanPass);
    cases.push({
      caseId: entry.caseId,
      ordinal: entry.ordinal,
      partition: entry.partition,
      criteria,
      criterionCoverage: round(safeRate(scoredCriteria.length, criteria.length)),
      meanAbsoluteError: round(safeRate(
        scoredCriteria.reduce((sum, item) => sum + item.absoluteError, 0),
        scoredCriteria.length,
      )),
      humanOverallPass: comparableHumanOverallPass,
      judgeOverallPass,
      passAgreement: comparableHumanOverallPass === judgeOverallPass,
      humanPinCount: gold.humanReview.annotations?.length ?? 0,
      judgePinCount: envelope.response.annotations.length,
      strictPinMatchCount: strictPinResult.matches.length,
      pinMatches,
      unmatchedHumanPins: locationPinResult.unmatchedHuman,
      unmatchedJudgePins: locationPinResult.unmatchedJudge,
      judgeConfidence: envelope.response.confidence,
      judgeAssessment: envelope.response.overallAssessment,
    });
  }
  if (cases.length === 0) throw new Error("The attempt has no successful results to compare.");

  const aggregate = aggregateComparisons(cases, calibration.rubric, policy);
  const report = {
    schemaVersion: JUDGE_SCHEMA_VERSION,
    type: "codex-image-judge-agreement",
    calibrationManifestSha256: calibration.sourceBundle.manifestSha256,
    model: attempt.model,
    codexVersion: attempt.codexVersion,
    partition: partition ?? attempt.partition,
    policy,
    ...aggregate,
    cases,
  };
  await writeFile(join(attemptRoot, "comparison.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(attemptRoot, "comparison.md"), markdownReport(report));
  return { root: attemptRoot, report };
}
