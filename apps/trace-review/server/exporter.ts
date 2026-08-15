import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { AssetStore } from './assets.js';
import type { StudioDatabase, StoredAsset } from './database.js';
import type { CanonicalEvalBundleV1 } from './manifest.js';

function sha256(buffer: Buffer | string): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function safeName(value: string): string {
  return basename(value).replace(/[^a-zA-Z0-9._-]+/g, '-');
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'review-set';
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.(\d{3})Z$/, '$1Z');
}

async function writeChecksummedFile(
  root: string,
  relativePath: string,
  value: Buffer | string,
  checksums: Record<string, string>,
): Promise<void> {
  const filePath = join(root, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, value, { flag: 'wx' });
  checksums[relativePath] = sha256(value);
}

export interface ExportResult {
  exportPath: string;
  bundle: CanonicalEvalBundleV1;
}

export class BundleExporter {
  constructor(
    private readonly database: StudioDatabase,
    private readonly assets: AssetStore,
    private readonly casesDir: string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async exportRun(runId: string): Promise<ExportResult> {
    const run = this.database.getRun(runId);
    if (!run) {
      throw new Error('RUN_NOT_FOUND');
    }

    await mkdir(this.casesDir, { recursive: true });
    const finalPath = join(this.casesDir, `${slugify(run.title)}-${timestamp(this.now())}`);
    const temporaryPath = join(this.casesDir, `.tmp-${randomUUID()}`);
    await mkdir(temporaryPath, { recursive: false });

    try {
      const checksums: Record<string, string> = {};
      const exportedTraces: CanonicalEvalBundleV1['traces'] = [];

      await writeChecksummedFile(
        temporaryPath,
        'prompt.txt',
        run.prompt ?? '',
        checksums,
      );
      await writeChecksummedFile(
        temporaryPath,
        'profiles/character.json',
        `${JSON.stringify(run.characterSnapshot, null, 2)}\n`,
        checksums,
      );
      await writeChecksummedFile(
        temporaryPath,
        'profiles/style.json',
        `${JSON.stringify(run.styleSnapshot, null, 2)}\n`,
        checksums,
      );
      await writeChecksummedFile(
        temporaryPath,
        'rubric.json',
        `${JSON.stringify(run.rubric, null, 2)}\n`,
        checksums,
      );

      for (const trace of run.traces) {
        const source = this.requireStoredAsset(trace.sourceAsset.id);
        const output = this.requireStoredAsset(trace.outputAsset.id);
        const prefix = String(trace.ordinal).padStart(2, '0');
        const sourcePath = `inputs/${prefix}-${safeName(source.originalName)}`;
        const outputPath = `outputs/${prefix}-${safeName(output.originalName)}`;
        await writeChecksummedFile(
          temporaryPath,
          sourcePath,
          await readFile(this.assets.resolveStoredPath(source)),
          checksums,
        );
        await writeChecksummedFile(
          temporaryPath,
          outputPath,
          await readFile(this.assets.resolveStoredPath(output)),
          checksums,
        );
        exportedTraces.push({
          source: sourcePath,
          output: outputPath,
          target: trace.target,
          notes: trace.notes,
          metadata: trace.sourceMetadata,
          review: {
            scores: trace.review.scores,
            completed: trace.review.completed,
            updatedAt: trace.review.updatedAt,
            annotations: trace.review.annotations.map((annotation) => ({
              assetRole: annotation.assetRole,
              x: annotation.x,
              y: annotation.y,
              category: annotation.category,
              severity: annotation.severity,
              note: annotation.note,
              createdAt: annotation.createdAt,
              updatedAt: annotation.updatedAt,
            })),
          },
        });
      }

      await writeChecksummedFile(
        temporaryPath,
        'reviews.json',
        `${JSON.stringify(
          run.traces.map((trace) => ({ traceId: trace.id, review: trace.review })),
          null,
          2,
        )}\n`,
        checksums,
      );

      const bundle: CanonicalEvalBundleV1 = {
        schemaVersion: 1,
        title: run.title,
        prompt: run.prompt,
        promptStatus: run.promptStatus,
        character: run.characterId
          ? { id: run.characterId, snapshot: run.characterSnapshot }
          : null,
        style: run.styleId
          ? { id: run.styleId, snapshot: run.styleSnapshot }
          : null,
        target: run.target,
        producedBy: run.producedBy,
        notes: run.notes,
        rubric: run.rubric,
        exportedAt: this.now().toISOString(),
        traces: exportedTraces,
        checksums,
      };
      await writeFile(
        join(temporaryPath, 'manifest.json'),
        `${JSON.stringify(bundle, null, 2)}\n`,
        { flag: 'wx' },
      );
      await rename(temporaryPath, finalPath);
      return { exportPath: finalPath, bundle };
    } catch (error) {
      await rm(temporaryPath, { recursive: true, force: true });
      throw error;
    }
  }

  private requireStoredAsset(id: string): StoredAsset {
    const asset = this.database.getAsset(id);
    if (!asset) {
      throw new Error(`Missing stored asset ${id}`);
    }
    return asset;
  }

}
