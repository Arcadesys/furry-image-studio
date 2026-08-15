import { createHash, randomUUID } from 'node:crypto';
import type { Dirent } from 'node:fs';
import { access, readdir, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import YAML from 'yaml';
import type { AnnotationInput, RunDetail } from '../shared/types.js';
import { AssetStore } from './assets.js';
import { DEFAULT_RUBRIC, EVAL_OUTPUTS_DIR } from './constants.js';
import type { StoredAsset, StudioDatabase } from './database.js';
import {
  canonicalImportSchema,
  type CanonicalImportManifest,
  type CanonicalReview,
  legacyManifestSchema,
} from './manifest.js';
import { loadProfiles } from './profiles.js';

const sourceManifestSchema = z.object({
  images: z.array(z.object({ file: z.string() }).passthrough()),
}).passthrough();

function titleCase(value: string): string {
  return value
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function isImageName(fileName: string): boolean {
  return ['.png', '.jpg', '.jpeg'].includes(extname(fileName).toLowerCase());
}

function assertPathInside(root: string, candidate: string): void {
  const relation = relative(resolve(root), resolve(candidate));
  if (relation === '..' || relation.startsWith(`..${sep}`) || isAbsolute(relation)) {
    throw new Error('Trace asset path escapes its import root');
  }
}

interface NormalizedTrace {
  source: string;
  output: string;
  target: string | null;
  notes: string[];
  metadata: Record<string, unknown> | null;
  review?: CanonicalReview;
}

interface NormalizedManifest {
  title: string;
  prompt: string | null;
  promptStatus: 'recorded' | 'missing';
  characterId: string | null;
  characterSnapshot: Record<string, unknown> | string | null;
  styleId: string | null;
  styleSnapshot: Record<string, unknown> | string | null;
  target: string | null;
  producedBy: string | null;
  notes: string | null;
  traces: NormalizedTrace[];
  rubric: typeof DEFAULT_RUBRIC;
  importRoot: string;
  checksums: Record<string, string> | null;
}

export class ManifestImporter {
  constructor(
    private readonly repoRoot: string,
    private readonly database: StudioDatabase,
    private readonly assets: AssetStore,
  ) {}

  async syncExistingEvalOutputs(): Promise<void> {
    const outputsRoot = join(this.repoRoot, EVAL_OUTPUTS_DIR);
    let outputDirectories: Dirent[];
    try {
      outputDirectories = await readdir(outputsRoot, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const manifestPaths = outputDirectories
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => join(outputsRoot, entry.name, 'manifest.json'))
      .sort();

    for (const absolutePath of manifestPaths) {
      try {
        await access(absolutePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          continue;
        }
        throw error;
      }
      await this.importManifest(absolutePath);
    }
  }

  async importManifest(manifestPathInput: string): Promise<RunDetail> {
    const manifestPath = isAbsolute(manifestPathInput)
      ? resolve(manifestPathInput)
      : resolve(this.repoRoot, manifestPathInput);
    const rawText = await readFile(manifestPath, 'utf8');
    const manifestRelation = relative(this.repoRoot, manifestPath);
    const sourceManifestPath = (
      manifestRelation === '..'
      || manifestRelation.startsWith(`..${sep}`)
      || isAbsolute(manifestRelation)
    )
      ? manifestPath
      : manifestRelation.split(sep).join('/');
    const sourceManifestSha256 = createHash('sha256').update(rawText).digest('hex');
    const existing = this.database.getRunBySourceManifest(
      sourceManifestPath,
      sourceManifestSha256,
    );
    if (existing) {
      return existing;
    }

    const rawManifest = this.parseManifest(rawText);
    const manifestDir = dirname(manifestPath);
    const canonicalResult = canonicalImportSchema.safeParse(rawManifest);
    const normalized = canonicalResult.success
      ? this.normalizeCanonical(canonicalResult.data, manifestDir)
      : await this.normalizeLegacy(rawManifest, manifestPath);
    await this.verifyChecksums(normalized, manifestDir);
    const referencedOutputs = new Set(normalized.traces.map((entry) => basename(entry.output)));
    const directoryEntries = await readdir(manifestDir, { withFileTypes: true });
    const orphanNames = directoryEntries
      .filter((entry) => entry.isFile() && isImageName(entry.name) && !referencedOutputs.has(entry.name))
      .map((entry) => entry.name)
      .sort();
    const warnings = orphanNames.map((fileName) => `Orphan output image: ${fileName}`);

    const now = new Date().toISOString();
    const runId = randomUUID();

    const ingested: Array<{
      entry: NormalizedTrace;
      sourceAsset: StoredAsset;
      outputAsset: StoredAsset;
    }> = [];
    for (const entry of normalized.traces) {
      const sourcePath = await this.resolveImportPath(normalized.importRoot, manifestDir, entry.source);
      const outputPath = await this.resolveImportPath(normalized.importRoot, manifestDir, entry.output);
      ingested.push({
        entry,
        sourceAsset: await this.assets.ingestFile(sourcePath),
        outputAsset: await this.assets.ingestFile(outputPath),
      });
    }

    const untrackedRun = this.database.findUntrackedRunByAssetPairs(
      ingested.map(({ sourceAsset, outputAsset }) => ({
        sourceSha256: sourceAsset.sha256,
        outputSha256: outputAsset.sha256,
      })),
    );
    if (untrackedRun) {
      this.database.attachSourceManifest(
        untrackedRun.id,
        sourceManifestPath,
        sourceManifestSha256,
      );
      return this.database.getRun(untrackedRun.id) ?? untrackedRun;
    }

    this.database.transaction(() => {
      this.database.insertRun({
        id: runId,
        sourceManifestPath,
        sourceManifestSha256,
        title: normalized.title,
        prompt: normalized.prompt,
        promptStatus: normalized.promptStatus,
        characterId: normalized.characterId,
        styleId: normalized.styleId,
        target: normalized.target,
        producedBy: normalized.producedBy,
        notes: normalized.notes,
        characterSnapshot: normalized.characterSnapshot,
        styleSnapshot: normalized.styleSnapshot,
        rubric: normalized.rubric,
        importWarnings: warnings,
        createdAt: now,
      });
      ingested.forEach(({ entry, sourceAsset, outputAsset }, index) => {
        this.database.insertTrace({
          id: randomUUID(),
          runId,
          ordinal: index + 1,
          sourceAssetId: sourceAsset.id,
          outputAssetId: outputAsset.id,
          target: entry.target ?? null,
          notes: entry.notes,
          sourceMetadata: entry.metadata,
          createdAt: now,
        });
      });
    });

    ingested.forEach(({ entry }, index) => {
      if (!entry.review) {
        return;
      }
      const traceId = this.database.getRun(runId)?.traces[index]?.id;
      if (!traceId) {
        throw new Error('Imported trace could not be loaded');
      }
      this.database.saveReview(
        traceId,
        { scores: entry.review.scores, completed: entry.review.completed },
        entry.review.updatedAt ?? now,
      );
      for (const annotation of entry.review.annotations) {
        const input: AnnotationInput = {
          assetRole: annotation.assetRole,
          x: annotation.x,
          y: annotation.y,
          category: annotation.category,
          severity: annotation.severity,
          note: annotation.note,
        };
        this.database.createAnnotation(
          randomUUID(),
          traceId,
          input,
          annotation.updatedAt ?? annotation.createdAt ?? now,
        );
      }
    });

    const run = this.database.getRun(runId);
    if (!run) {
      throw new Error('Imported run could not be loaded');
    }
    return run;
  }

  private normalizeCanonical(
    manifest: CanonicalImportManifest,
    manifestDir: string,
  ): NormalizedManifest {
    return {
      title: manifest.title,
      prompt: manifest.prompt,
      promptStatus: manifest.promptStatus,
      characterId: manifest.character?.id ?? null,
      characterSnapshot: manifest.character?.snapshot as Record<string, unknown> | string | null ?? null,
      styleId: manifest.style?.id ?? null,
      styleSnapshot: manifest.style?.snapshot as Record<string, unknown> | string | null ?? null,
      target: manifest.target,
      producedBy: manifest.producedBy,
      notes: manifest.notes,
      traces: manifest.traces.map((trace) => ({
        source: trace.source,
        output: trace.output,
        target: trace.target ?? null,
        notes: trace.notes,
        metadata: trace.metadata ?? null,
        review: trace.review,
      })),
      rubric: manifest.rubric ?? DEFAULT_RUBRIC,
      importRoot: manifestDir,
      checksums: manifest.checksums ?? null,
    };
  }

  private async normalizeLegacy(rawManifest: unknown, manifestPath: string): Promise<NormalizedManifest> {
    const manifest = legacyManifestSchema.parse(rawManifest);
    const manifestDir = dirname(manifestPath);
    const sourceMetadata = await this.loadSourceMetadata(manifest.outputs, manifestDir);
    const profiles = await loadProfiles(this.repoRoot);
    const style = manifest.style
      ? profiles.styles.find((profile) => profile.id === manifest.style) ?? null
      : null;
    const folderId = basename(manifestDir);
    const species = typeof manifest.character?.species === 'string'
      ? manifest.character.species
      : null;
    const characterId = species?.split(/\s+/).at(-1)?.toLowerCase() ?? folderId.replace(/^toon-/, '');
    const evalsRoot = join(this.repoRoot, 'evals');
    const manifestRelationToEvals = relative(evalsRoot, manifestPath);
    const importRoot = manifestRelationToEvals === '..' || manifestRelationToEvals.startsWith(`..${sep}`)
      ? manifestDir
      : evalsRoot;

    return {
      title: titleCase(folderId),
      prompt: null,
      promptStatus: 'missing',
      characterId,
      characterSnapshot: manifest.character ?? null,
      styleId: manifest.style ?? null,
      styleSnapshot: style?.raw ?? null,
      target: 'primary foreground subject / selfie-taker',
      producedBy: null,
      notes: manifest.description ?? null,
      rubric: DEFAULT_RUBRIC,
      importRoot,
      checksums: null,
      traces: manifest.outputs.map((entry) => {
        const {
          source: _source,
          output: _output,
          target: _target,
          notes: _notes,
          ...unknownMetadata
        } = entry;
        const historicalSourceMetadata = sourceMetadata.get(basename(entry.source));
        const metadata = {
          ...(historicalSourceMetadata ?? {}),
          ...unknownMetadata,
        };
        return {
          source: entry.source,
          output: entry.output,
          target: entry.target ?? null,
          notes: entry.notes,
          metadata: Object.keys(metadata).length > 0 ? metadata : null,
        };
      }),
    };
  }

  private async resolveImportPath(
    importRoot: string,
    manifestDir: string,
    relativePath: string,
  ): Promise<string> {
    if (isAbsolute(relativePath)) {
      throw new Error('Trace asset paths must be relative to the manifest');
    }
    const candidate = resolve(manifestDir, relativePath);
    assertPathInside(importRoot, candidate);
    const [realRoot, realCandidate] = await Promise.all([
      realpath(importRoot),
      realpath(candidate),
    ]);
    assertPathInside(realRoot, realCandidate);
    return realCandidate;
  }

  private async verifyChecksums(
    manifest: NormalizedManifest,
    manifestDir: string,
  ): Promise<void> {
    if (!manifest.checksums) {
      return;
    }
    for (const [relativePath, expected] of Object.entries(manifest.checksums)) {
      if (!/^[a-f0-9]{64}$/i.test(expected)) {
        throw new Error(`Checksum is not SHA-256 for ${relativePath}`);
      }
      const filePath = await this.resolveImportPath(manifest.importRoot, manifestDir, relativePath);
      const actual = createHash('sha256').update(await readFile(filePath)).digest('hex');
      if (actual.toLowerCase() !== expected.toLowerCase()) {
        throw new Error(`Checksum mismatch for ${relativePath}`);
      }
    }
  }

  private async loadSourceMetadata(
    outputs: Array<{ source: string }>,
    manifestDir: string,
  ): Promise<Map<string, Record<string, unknown>>> {
    const metadata = new Map<string, Record<string, unknown>>();
    const sourceDirectories = new Set(outputs.map((entry) => dirname(resolve(manifestDir, entry.source))));

    for (const sourceDirectory of sourceDirectories) {
      const sourceManifestPath = join(sourceDirectory, 'manifest.json');
      try {
        const parsed = sourceManifestSchema.parse(JSON.parse(await readFile(sourceManifestPath, 'utf8')));
        for (const image of parsed.images) {
          metadata.set(basename(image.file), image);
        }
      } catch {
        // Historical source metadata is optional; missing data remains explicit as null.
      }
    }
    return metadata;
  }

  private parseManifest(raw: string): unknown {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return YAML.parse(raw) as unknown;
    }
  }
}
