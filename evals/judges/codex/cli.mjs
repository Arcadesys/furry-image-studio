#!/usr/bin/env node

import { resolve } from "node:path";
import {
  compareAttempt,
  prepareCalibration,
  runJudgeAttempt,
} from "./lib.mjs";

function usage() {
  return `Codex image judge

Usage:
  cli.mjs prepare --bundle <eval-bundle> [--out <dir>] [--holdout 0.25]
  cli.mjs run --calibration <dir> --model <model> [--partition all|calibration|holdout]
              [--case <case-id>] [--concurrency 1|2] [--guidance <file>]
  cli.mjs compare --calibration <dir> --attempt <dir> [--partition calibration|holdout]
                  [--policy <file>]
  cli.mjs all --bundle <eval-bundle> --model <model> [prepare/run options]
`;
}

function parseArgs(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    if (key === "case") {
      options.case = [...(options.case ?? []), next];
    } else {
      options[key] = next;
    }
    index += 1;
  }
  return options;
}

function required(options, key) {
  const value = options[key];
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function numberOption(options, key, fallback) {
  if (options[key] === undefined) return fallback;
  const value = Number(options[key]);
  if (!Number.isFinite(value)) throw new Error(`--${key} must be numeric.`);
  return value;
}

async function prepare(options) {
  const result = await prepareCalibration({
    bundleDir: resolve(required(options, "bundle")),
    outputDir: options.out ? resolve(options.out) : undefined,
    holdoutFraction: numberOption(options, "holdout", 0.25),
  });
  console.log(`Prepared ${result.calibration.caseCount} blind cases at ${result.root}`);
  return result;
}

async function run(options, calibrationDir = null) {
  const result = await runJudgeAttempt({
    calibrationDir: resolve(calibrationDir ?? required(options, "calibration")),
    model: required(options, "model"),
    partition: options.partition ?? "all",
    caseIds: options.case ?? [],
    concurrency: numberOption(options, "concurrency", 1),
    guidancePath: options.guidance ? resolve(options.guidance) : undefined,
  });
  console.log(
    `Judged ${result.attempt.succeeded}/${result.attempt.caseCount} cases at ${result.root}`,
  );
  if (result.attempt.failed > 0) process.exitCode = 2;
  return result;
}

async function compare(options, calibrationDir = null, attemptDir = null) {
  const requestedPartition = options.partition === "all" ? null : options.partition ?? null;
  const result = await compareAttempt({
    calibrationDir: resolve(calibrationDir ?? required(options, "calibration")),
    attemptDir: resolve(attemptDir ?? required(options, "attempt")),
    policyPath: options.policy ? resolve(options.policy) : undefined,
    partition: requestedPartition,
  });
  console.log(
    `Agreement verdict: ${result.report.verdict}; `
    + `MAE ${result.report.totals.meanAbsoluteError ?? "n/a"}; `
    + `pass agreement ${result.report.totals.passFailAgreement ?? "n/a"}`,
  );
  console.log(`Report: ${resolve(result.root, "comparison.md")}`);
  return result;
}

async function main() {
  const [command, ...values] = process.argv.slice(2);
  if (!command || ["help", "--help", "-h"].includes(command)) {
    console.log(usage());
    return;
  }
  const options = parseArgs(values);
  if (command === "prepare") {
    await prepare(options);
    return;
  }
  if (command === "run") {
    await run(options);
    return;
  }
  if (command === "compare") {
    await compare(options);
    return;
  }
  if (command === "all") {
    const prepared = await prepare(options);
    const judged = await run(options, prepared.root);
    await compare(options, prepared.root, judged.root);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
