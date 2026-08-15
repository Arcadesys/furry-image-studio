#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const bundledPluginRoot = resolve(moduleDir, "..");
const maxImageBytes = 30 * 1024 * 1024;
const supportedImageExtensions = new Set([".png", ".jpg", ".jpeg"]);

export const defaultRubric = [
  { id: "target-selection", label: "Target selection", passThreshold: 4 },
  { id: "character-fidelity", label: "Character fidelity", passThreshold: 4 },
  { id: "background-preservation", label: "Background preservation", passThreshold: 4 },
  { id: "paws-anatomy", label: "Paws / anatomy", passThreshold: 4 },
  { id: "lighting-color", label: "Lighting / color", passThreshold: 4 },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJson(entry)]),
    );
  }
  return value;
}

function digestJson(value) {
  return sha256(JSON.stringify(stableJson(value)));
}

function slugify(value) {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
  return slug || "eval-run";
}

function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function resolveRepoRoot(repoInput) {
  const configured = repoInput ?? process.env.FURRY_IMAGE_STUDIO_EVAL_REPO;
  const candidates = configured
    ? [resolve(configured)]
    : [
        resolve(process.cwd()),
        resolve(homedir(), "plugins", "furry-image-studio"),
      ];
  for (const candidate of [...new Set(candidates)]) {
    const contractPath = join(candidate, "apps", "trace-review", "PIPELINE.md");
    if (await exists(contractPath)) return candidate;
  }
  throw new Error(
    "Eval repository not found. Pass --repo or set FURRY_IMAGE_STUDIO_EVAL_REPO "
    + "to a Furry Image Studio checkout.",
  );
}

function resolveInputPath(inputRoot, value, label) {
  return resolve(inputRoot, assertNonEmptyString(value, label));
}

async function loadImage(inputRoot, value, label) {
  const path = resolveInputPath(inputRoot, value, label);
  const extension = extname(path).toLowerCase();
  if (!supportedImageExtensions.has(extension)) {
    throw new Error(`${label} must be a PNG or JPEG image.`);
  }
  const details = await stat(path);
  if (!details.isFile() || details.size === 0 || details.size > maxImageBytes) {
    throw new Error(`${label} must be a non-empty image no larger than 30 MB.`);
  }
  const bytes = await readFile(path);
  return {
    path,
    bytes,
    sha256: sha256(bytes),
    extension: extension === ".jpeg" ? ".jpg" : extension,
  };
}

async function firstReadable(paths) {
  for (const path of paths) {
    try {
      return { path, raw: await readFile(path, "utf8") };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  return null;
}

async function loadProfile({
  repoRoot,
  inputRoot,
  kind,
  id,
  explicitPath,
  inlineProfile,
}) {
  if (inlineProfile !== undefined) {
    return { id: id ?? null, snapshot: inlineProfile };
  }
  if (!id && !explicitPath) return null;

  const fileName = kind === "character" ? "character.md" : `${id}.md`;
  const candidates = [];
  if (explicitPath) candidates.push(resolve(inputRoot, explicitPath));
  if (id) {
    const relativeProfile = kind === "character"
      ? join("assets", "characters", id, fileName)
      : join("assets", "styles", fileName);
    candidates.push(
      join(repoRoot, relativeProfile),
      join(repoRoot, "plugins", "furry-image-studio", relativeProfile),
      join(bundledPluginRoot, relativeProfile),
    );
  }

  const loaded = await firstReadable([...new Set(candidates)]);
  if (!loaded) {
    throw new Error(
      `${kind} profile ${id ?? explicitPath} was not found. `
      + `Pass --${kind}-profile or provide it in the recorder spec.`,
    );
  }
  return {
    id: id ?? null,
    snapshot: loaded.raw,
  };
}

function normalizeNotes(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  return value.map((entry) => entry.trim()).filter(Boolean);
}

function normalizeRubric(value) {
  if (value === undefined) return defaultRubric;
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("rubric must be a non-empty array.");
  }
  return value.map((criterion, index) => {
    assertObject(criterion, `rubric[${index}]`);
    const passThreshold = Number(criterion.passThreshold);
    if (!Number.isInteger(passThreshold) || passThreshold < 1 || passThreshold > 5) {
      throw new Error(`rubric[${index}].passThreshold must be an integer from 1 to 5.`);
    }
    return {
      id: assertNonEmptyString(criterion.id, `rubric[${index}].id`),
      label: assertNonEmptyString(criterion.label, `rubric[${index}].label`),
      passThreshold,
    };
  });
}

function generationMetadata(generation) {
  if (!generation) return null;
  assertObject(generation, "generation");
  const compact = Object.fromEntries(
    Object.entries(generation).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  return Object.keys(compact).length > 0 ? compact : null;
}

async function normalizeSpec(rawSpec, { repoRoot, inputRoot }) {
  const spec = assertObject(rawSpec, "recorder spec");
  if (spec.schemaVersion !== undefined && spec.schemaVersion !== 1) {
    throw new Error(`Unsupported recorder spec version: ${spec.schemaVersion}`);
  }
  const title = assertNonEmptyString(spec.title, "title");
  const promptStatus = spec.promptStatus ?? "recorded";
  if (!["recorded", "missing"].includes(promptStatus)) {
    throw new Error("promptStatus must be recorded or missing.");
  }
  const prompt = promptStatus === "recorded"
    ? assertNonEmptyString(spec.prompt, "prompt")
    : null;
  if (promptStatus === "missing" && spec.prompt !== undefined && spec.prompt !== null) {
    throw new Error("prompt must be null or omitted when promptStatus is missing.");
  }
  if (!Array.isArray(spec.traces) || spec.traces.length < 1 || spec.traces.length > 8) {
    throw new Error("traces must contain between 1 and 8 entries.");
  }

  const characterInput = spec.character && assertObject(spec.character, "character");
  const styleInput = spec.style && assertObject(spec.style, "style");
  const character = await loadProfile({
    repoRoot,
    inputRoot,
    kind: "character",
    id: characterInput?.id ?? spec.characterId ?? null,
    explicitPath: spec.characterProfile,
    inlineProfile: characterInput?.snapshot,
  });
  const style = await loadProfile({
    repoRoot,
    inputRoot,
    kind: "style",
    id: styleInput?.id ?? spec.styleId ?? null,
    explicitPath: spec.styleProfile,
    inlineProfile: styleInput?.snapshot,
  });
  const generation = generationMetadata(spec.generation);
  const traces = [];

  for (const [index, rawTrace] of spec.traces.entries()) {
    const trace = assertObject(rawTrace, `traces[${index}]`);
    const source = await loadImage(inputRoot, trace.source, `traces[${index}].source`);
    const output = await loadImage(inputRoot, trace.output, `traces[${index}].output`);
    const metadata = trace.metadata === undefined || trace.metadata === null
      ? {}
      : assertObject(trace.metadata, `traces[${index}].metadata`);
    traces.push({
      source,
      output,
      target: trace.target ?? spec.target ?? null,
      notes: normalizeNotes(trace.notes, `traces[${index}].notes`),
      metadata: {
        ...metadata,
        ...(generation ? { generation } : {}),
      },
    });
  }

  return {
    title,
    prompt,
    promptStatus,
    character,
    style,
    target: spec.target ?? null,
    producedBy: spec.producedBy ?? "Codex / ChatGPT Desktop + Furry Image Studio",
    notes: spec.notes ?? null,
    rubric: normalizeRubric(spec.rubric),
    traces,
  };
}

function semanticTrace(trace, prompt) {
  return {
    prompt,
    sourceSha256: trace.source.sha256,
    outputSha256: trace.output.sha256,
    target: trace.target,
    notes: trace.notes,
    metadata: trace.metadata,
  };
}

function semanticRun(run) {
  return {
    title: run.title,
    prompt: run.prompt,
    character: run.character,
    style: run.style,
    target: run.target,
    producedBy: run.producedBy,
    notes: run.notes,
    rubric: run.rubric,
    traces: run.traces.map((trace) => semanticTrace(trace, run.prompt)),
  };
}

async function writePayload(root, relativePath, value, checksums) {
  const path = join(root, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, value, { flag: "wx" });
  checksums[relativePath] = sha256(value);
}

async function verifyExistingRun(runPath, expectedRunId) {
  const manifestPath = join(runPath, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  if (manifest.runId !== expectedRunId) {
    throw new Error(`Existing eval directory does not match ${expectedRunId}.`);
  }
  for (const [relativePath, expected] of Object.entries(manifest.checksums ?? {})) {
    const actual = sha256(await readFile(join(runPath, relativePath)));
    if (actual !== expected) {
      throw new Error(`Existing eval checksum mismatch: ${relativePath}`);
    }
  }
  return manifest;
}

export async function recordEvalRun(rawSpec, options = {}) {
  const repoRoot = await resolveRepoRoot(options.repoRoot);
  const inputRoot = resolve(options.inputRoot ?? process.cwd());
  const run = await normalizeSpec(rawSpec, { repoRoot, inputRoot });
  const runDigest = digestJson(semanticRun(run));
  const runId = `run-${runDigest.slice(0, 24)}`;
  const outputRoot = join(repoRoot, "evals", "outputs");
  const runPath = join(outputRoot, `${slugify(run.title)}-${runDigest.slice(0, 12)}`);
  const manifestPath = join(runPath, "manifest.json");

  await mkdir(outputRoot, { recursive: true });
  if (await exists(runPath)) {
    const manifest = await verifyExistingRun(runPath, runId);
    return {
      status: "existing",
      runId,
      runPath,
      manifestPath,
      traceIds: manifest.traces.map((trace) => trace.id),
    };
  }

  const temporaryPath = join(outputRoot, `.tmp-${runId}-${process.pid}-${randomUUID()}`);
  await mkdir(temporaryPath, { recursive: false });
  try {
    const checksums = {};
    const recordedAt = (options.now?.() ?? new Date()).toISOString();
    await writePayload(temporaryPath, "prompt.txt", run.prompt ? `${run.prompt}\n` : "", checksums);
    await writePayload(
      temporaryPath,
      "profiles/character.json",
      `${JSON.stringify(run.character, null, 2)}\n`,
      checksums,
    );
    await writePayload(
      temporaryPath,
      "profiles/style.json",
      `${JSON.stringify(run.style, null, 2)}\n`,
      checksums,
    );
    await writePayload(
      temporaryPath,
      "rubric.json",
      `${JSON.stringify(run.rubric, null, 2)}\n`,
      checksums,
    );

    const traces = [];
    for (const [index, trace] of run.traces.entries()) {
      const prefix = String(index + 1).padStart(2, "0");
      const sourcePath = `inputs/${prefix}-source${trace.source.extension}`;
      const outputPath = `outputs/${prefix}-output${trace.output.extension}`;
      await writePayload(temporaryPath, sourcePath, trace.source.bytes, checksums);
      await writePayload(temporaryPath, outputPath, trace.output.bytes, checksums);
      const traceDigest = digestJson(semanticTrace(trace, run.prompt));
      traces.push({
        id: `trace-${traceDigest.slice(0, 24)}`,
        source: sourcePath,
        output: outputPath,
        target: trace.target,
        notes: trace.notes,
        metadata: Object.keys(trace.metadata).length > 0 ? trace.metadata : null,
      });
    }

    const manifest = {
      schemaVersion: 1,
      runId,
      title: run.title,
      prompt: run.prompt,
      promptStatus: run.promptStatus,
      character: run.character,
      style: run.style,
      target: run.target,
      producedBy: run.producedBy,
      notes: run.notes,
      rubric: run.rubric,
      traces,
      recordedAt,
      checksums,
    };
    await writeFile(
      join(temporaryPath, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { flag: "wx" },
    );
    await rename(temporaryPath, runPath);
    return {
      status: "recorded",
      runId,
      runPath,
      manifestPath,
      traceIds: traces.map((trace) => trace.id),
    };
  } catch (error) {
    await rm(temporaryPath, { recursive: true, force: true });
    if (error?.code === "EEXIST" && await exists(runPath)) {
      const manifest = await verifyExistingRun(runPath, runId);
      return {
        status: "existing",
        runId,
        runPath,
        manifestPath,
        traceIds: manifest.traces.map((trace) => trace.id),
      };
    }
    throw error;
  }
}

function parseArgs(values) {
  const options = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) throw new Error(`Unexpected argument: ${value}`);
    const key = value.slice(2);
    const next = values[index + 1];
    if (!next || next.startsWith("--")) throw new Error(`Missing value for --${key}.`);
    if (key === "note") {
      options.note = [...(options.note ?? []), next];
    } else {
      options[key] = next;
    }
    index += 1;
  }
  return options;
}

function parseJsonOption(value, label) {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }
}

function usage() {
  return `Record an immutable Furry Image Studio eval run

Usage:
  record_eval_run.mjs --repo <checkout> --spec <spec.json>

  record_eval_run.mjs --repo <checkout> --source <image> --output <image>
    --title <title> (--prompt <text> | --prompt-file <file>)
    [--character <id>] [--character-profile <file>]
    [--style <id>] [--style-profile <file>] [--target <description>]
    [--model <model>] [--quality <quality>] [--size <size>]
    [--settings-json <json>] [--metadata-json <json>] [--note <text>]

For historical results whose exact prompt is unavailable, pass
--prompt-status missing and omit --prompt and --prompt-file.

Paths in a spec are resolved relative to the spec file. Direct argument paths
are resolved relative to the current directory. The repository can also be set
with FURRY_IMAGE_STUDIO_EVAL_REPO.
`;
}

export async function runCli(values = process.argv.slice(2)) {
  if (values.length === 0 || values.some((value) => ["-h", "--help", "help"].includes(value))) {
    process.stdout.write(usage());
    return;
  }
  const args = parseArgs(values);
  let spec;
  let inputRoot = process.cwd();
  if (args.spec) {
    const specPath = resolve(args.spec);
    spec = JSON.parse(await readFile(specPath, "utf8"));
    inputRoot = dirname(specPath);
  } else {
    let prompt = args.prompt;
    if (args["prompt-file"]) {
      prompt = await readFile(resolve(args["prompt-file"]), "utf8");
    }
    const settings = parseJsonOption(args["settings-json"], "--settings-json");
    const metadata = parseJsonOption(args["metadata-json"], "--metadata-json");
    spec = {
      schemaVersion: 1,
      title: args.title,
      prompt,
      promptStatus: args["prompt-status"] ?? "recorded",
      characterId: args.character,
      characterProfile: args["character-profile"],
      styleId: args.style,
      styleProfile: args["style-profile"],
      target: args.target ?? null,
      producedBy: args.producer,
      notes: args["run-notes"] ?? null,
      generation: {
        provider: args.provider ?? "OpenAI imagegen",
        model: args.model,
        quality: args.quality,
        size: args.size,
        settings,
      },
      traces: [{
        source: args.source,
        output: args.output,
        target: args.target ?? null,
        notes: args.note ?? [],
        metadata,
      }],
    };
  }
  const result = await recordEvalRun(spec, {
    repoRoot: args.repo,
    inputRoot,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
