import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const siteRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(siteRoot, "../..");
const evalsRoot = join(repoRoot, "evals");
const outputsRoot = join(evalsRoot, "outputs");
const generatedRoot = join(siteRoot, "generated");
const assetRoot = join(siteRoot, "public", "eval-assets");

const rubric = [
  { id: "target-selection", label: "Target selection", passThreshold: 4 },
  { id: "character-fidelity", label: "Character fidelity", passThreshold: 4 },
  { id: "background-preservation", label: "Background preservation", passThreshold: 4 },
  { id: "paws-anatomy", label: "Paws / anatomy", passThreshold: 4 },
  { id: "lighting-color", label: "Lighting / color", passThreshold: 4 },
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableId(prefix, value) {
  return `${prefix}-${sha256(value).slice(0, 24)}`;
}

function titleCase(value) {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function parseFrontmatter(raw, fallbackId) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  const fields = {};
  for (const line of match?.[1]?.split("\n") ?? []) {
    const separator = line.indexOf(":");
    if (separator > 0) {
      fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
    }
  }
  const id = fields.id || fallbackId;
  return {
    id,
    displayName: fields.display_name || titleCase(id),
    raw,
  };
}

function pngDimensions(buffer) {
  const png = buffer.length >= 24
    && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return png
    ? { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
    : { width: 0, height: 0 };
}

function jpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return { width: 0, height: 0 };
}

async function loadProfiles() {
  const characters = [];
  const characterRoot = join(repoRoot, "assets", "characters");
  for (const entry of await readdir(characterRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) continue;
    const profilePath = join(characterRoot, entry.name, "character.md");
    try {
      characters.push(parseFrontmatter(await readFile(profilePath, "utf8"), entry.name));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const styles = [];
  const styleRoot = join(repoRoot, "assets", "styles");
  for (const entry of await readdir(styleRoot, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith("_") || extname(entry.name) !== ".md") continue;
    const id = basename(entry.name, ".md");
    styles.push(parseFrontmatter(await readFile(join(styleRoot, entry.name), "utf8"), id));
  }
  return {
    characters: characters.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    styles: styles.sort((a, b) => a.displayName.localeCompare(b.displayName)),
  };
}

async function sourceMetadata() {
  const metadata = new Map();
  const sourcesRoot = join(evalsRoot, "sources");
  let sourceSets = [];
  try {
    sourceSets = await readdir(sourcesRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return metadata;
    throw error;
  }
  for (const sourceSet of sourceSets) {
    if (!sourceSet.isDirectory()) continue;
    try {
      const manifest = JSON.parse(
        await readFile(join(sourcesRoot, sourceSet.name, "manifest.json"), "utf8"),
      );
      for (const image of manifest.images ?? []) {
        if (typeof image.file === "string") metadata.set(image.file, image);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return metadata;
}

const copiedAssets = new Map();

async function assetFromFile(filePath, createdAt) {
  const buffer = await readFile(filePath);
  const digest = sha256(buffer);
  const extension = extname(filePath).toLowerCase();
  const mediaType = extension === ".jpg" || extension === ".jpeg"
    ? "image/jpeg"
    : "image/png";
  const publicExtension = mediaType === "image/jpeg" ? ".jpg" : ".png";
  const outputName = `${digest}${publicExtension}`;
  if (!copiedAssets.has(digest)) {
    await copyFile(filePath, join(assetRoot, outputName));
    copiedAssets.set(digest, outputName);
  }
  const dimensions = mediaType === "image/png"
    ? pngDimensions(buffer)
    : jpegDimensions(buffer);
  return {
    id: `asset-${digest.slice(0, 24)}`,
    sha256: digest,
    originalName: basename(filePath),
    mediaType,
    byteSize: buffer.byteLength,
    width: dimensions.width,
    height: dimensions.height,
    url: `/eval-assets/${outputName}`,
    createdAt,
  };
}

async function resolveTracePath(manifestDir, manifest, tracePath) {
  const root = Array.isArray(manifest.traces) ? manifestDir : evalsRoot;
  const filePath = resolve(manifestDir, tracePath);
  const relation = relative(root, filePath);
  if (relation === ".." || relation.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new Error(`Trace path escapes its evidence root: ${tracePath}`);
  }
  return filePath;
}

async function buildRun(manifestPath, metadata) {
  const manifestDir = dirname(manifestPath);
  const folderId = basename(manifestDir);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const manifestStats = await stat(manifestPath);
  const createdAt = manifestStats.mtime.toISOString();
  const canonical = Array.isArray(manifest.traces);
  const entries = canonical ? manifest.traces : manifest.outputs;
  const runId = canonical && typeof manifest.runId === "string"
    ? manifest.runId
    : stableId("run", relative(repoRoot, manifestPath));
  const outputNames = new Set(entries.map((entry) => basename(entry.output)));
  const directoryEntries = await readdir(manifestDir, { withFileTypes: true });
  const importWarnings = directoryEntries
    .filter((entry) => (
      entry.isFile()
      && [".png", ".jpg", ".jpeg"].includes(extname(entry.name).toLowerCase())
      && !outputNames.has(entry.name)
    ))
    .map((entry) => `Orphan output image: ${entry.name}`)
    .sort();
  const traces = [];

  for (const [index, entry] of entries.entries()) {
    const sourcePath = await resolveTracePath(manifestDir, manifest, entry.source);
    const outputPath = await resolveTracePath(manifestDir, manifest, entry.output);
    const traceId = canonical && typeof entry.id === "string"
      ? entry.id
      : stableId("trace", `${relative(repoRoot, manifestPath)}:${index + 1}`);
    const importedReview = entry.review ?? null;
    const annotations = (importedReview?.annotations ?? []).map((annotation, annotationIndex) => ({
      id: annotation.id ?? stableId("annotation", `${traceId}:${annotationIndex + 1}`),
      traceId,
      assetRole: annotation.assetRole,
      x: annotation.x,
      y: annotation.y,
      category: annotation.category,
      severity: annotation.severity,
      note: annotation.note,
      createdAt: annotation.createdAt ?? createdAt,
      updatedAt: annotation.updatedAt ?? annotation.createdAt ?? createdAt,
    }));
    const scores = importedReview?.scores ?? {};
    const completed = importedReview?.completed ?? false;
    traces.push({
      id: traceId,
      runId,
      ordinal: index + 1,
      sourceAsset: await assetFromFile(sourcePath, createdAt),
      outputAsset: await assetFromFile(outputPath, createdAt),
      target: entry.target ?? null,
      notes: entry.notes ?? [],
      sourceMetadata: entry.metadata ?? metadata.get(basename(sourcePath)) ?? null,
      status: completed
        ? "graded"
        : Object.keys(scores).length > 0 || annotations.length > 0
          ? "draft"
          : "ungraded",
      review: {
        traceId,
        scores,
        completed,
        updatedAt: importedReview?.updatedAt ?? createdAt,
        annotations,
      },
      createdAt,
    });
  }

  const species = typeof manifest.character?.species === "string"
    ? manifest.character.species
    : null;
  const characterId = canonical
    ? manifest.character?.id ?? null
    : species?.split(/\s+/).at(-1)?.toLowerCase() ?? folderId.replace(/^toon-/, "");
  return {
    id: runId,
    title: canonical ? manifest.title : titleCase(folderId),
    prompt: canonical ? manifest.prompt : null,
    promptStatus: canonical ? manifest.promptStatus : "missing",
    characterId,
    styleId: canonical ? manifest.style?.id ?? null : manifest.style ?? null,
    target: canonical ? manifest.target : "primary foreground subject / selfie-taker",
    producedBy: canonical ? manifest.producedBy : null,
    notes: canonical ? manifest.notes : manifest.description ?? null,
    traceCount: traces.length,
    gradedCount: traces.filter((trace) => trace.status === "graded").length,
    importWarnings,
    createdAt,
    updatedAt: createdAt,
    characterSnapshot: canonical
      ? manifest.character?.snapshot ?? null
      : manifest.character ?? null,
    styleSnapshot: canonical ? manifest.style?.snapshot ?? null : null,
    rubric: manifest.rubric ?? rubric,
    traces,
  };
}

await rm(assetRoot, { recursive: true, force: true });
await mkdir(assetRoot, { recursive: true });
await mkdir(generatedRoot, { recursive: true });
await copyFile(join(repoRoot, "assets", "plugin-logo.png"), join(siteRoot, "public", "plugin-logo.png"));

const metadata = await sourceMetadata();
const profiles = await loadProfiles();
const outputDirectories = (await readdir(outputsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
  .sort((a, b) => a.name.localeCompare(b.name));
const runs = [];
for (const directory of outputDirectories) {
  const manifestPath = join(outputsRoot, directory.name, "manifest.json");
  try {
    runs.push(await buildRun(manifestPath, metadata));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.title.localeCompare(b.title));

for (const run of runs) {
  if (run.characterId && !profiles.characters.some((profile) => profile.id === run.characterId)) {
    profiles.characters.push({
      id: run.characterId,
      displayName: titleCase(run.characterId),
      raw: "",
    });
  }
}
profiles.characters.sort((a, b) => a.displayName.localeCompare(b.displayName));

const data = {
  generatedAt: runs.map((run) => run.createdAt).sort().at(-1) ?? new Date(0).toISOString(),
  bootstrap: {
    runs: runs.map(({ traces, rubric: _rubric, characterSnapshot: _character, styleSnapshot: _style, ...run }) => run),
    characters: profiles.characters,
    styles: profiles.styles,
  },
  runs: Object.fromEntries(runs.map((run) => [run.id, run])),
};

await writeFile(
  join(generatedRoot, "eval-data.json"),
  `${JSON.stringify(data, null, 2)}\n`,
);
console.log(`Prepared ${runs.length} review sets and ${runs.reduce((total, run) => total + run.traceCount, 0)} traces.`);
