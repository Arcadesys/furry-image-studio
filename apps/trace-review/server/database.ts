import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Annotation,
  AnnotationInput,
  Asset,
  Review,
  ReviewInput,
  RubricCriterion,
  RunDetail,
  RunSummary,
  Trace,
  TraceStatus,
} from '../shared/types.js';

export interface StoredAsset extends Asset {
  storageName: string;
}

export interface NewAsset {
  id: string;
  sha256: string;
  originalName: string;
  mediaType: Asset['mediaType'];
  byteSize: number;
  width: number;
  height: number;
  storageName: string;
  createdAt: string;
}

export interface NewRun {
  id: string;
  sourceManifestPath: string;
  sourceManifestSha256: string;
  title: string;
  prompt: string | null;
  promptStatus: 'recorded' | 'missing';
  characterId: string | null;
  styleId: string | null;
  target: string | null;
  producedBy: string | null;
  notes: string | null;
  characterSnapshot: Record<string, unknown> | string | null;
  styleSnapshot: Record<string, unknown> | string | null;
  rubric: RubricCriterion[];
  importWarnings: string[];
  createdAt: string;
}

export interface NewTrace {
  id: string;
  runId: string;
  ordinal: number;
  sourceAssetId: string;
  outputAssetId: string;
  target: string | null;
  notes: string[];
  sourceMetadata: Record<string, unknown> | null;
  createdAt: string;
}

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string' || value.length === 0) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function asNullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : asString(value);
}

function asNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function asBoolean(value: unknown): boolean {
  return value === 1 || value === true;
}

export class StudioDatabase {
  readonly connection: DatabaseSync;

  constructor(readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.connection = new DatabaseSync(dbPath);
    this.connection.exec('PRAGMA foreign_keys = ON');
    this.connection.exec('PRAGMA journal_mode = WAL');
    this.migrate();
  }

  close(): void {
    this.connection.close();
  }

  transaction<T>(operation: () => T): T {
    this.connection.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.connection.exec('COMMIT');
      return result;
    } catch (error) {
      this.connection.exec('ROLLBACK');
      throw error;
    }
  }

  countRuns(): number {
    const row = this.connection.prepare('SELECT COUNT(*) AS count FROM runs').get() as Row;
    return asNumber(row.count);
  }

  countAssets(): number {
    const row = this.connection.prepare('SELECT COUNT(*) AS count FROM assets').get() as Row;
    return asNumber(row.count);
  }

  getRunBySourceManifest(path: string, sha256: string): RunDetail | null {
    const row = this.connection.prepare(`
      SELECT id
      FROM runs
      WHERE source_manifest_path = ? AND source_manifest_sha256 = ?
    `).get(path, sha256) as Row | undefined;
    return row ? this.getRun(asString(row.id)) : null;
  }

  findUntrackedRunByAssetPairs(
    pairs: Array<{ sourceSha256: string; outputSha256: string }>,
  ): RunDetail | null {
    const rows = this.connection.prepare(`
      SELECT id
      FROM runs
      WHERE source_manifest_path IS NULL
      ORDER BY created_at ASC
    `).all() as Row[];

    for (const row of rows) {
      const run = this.getRun(asString(row.id));
      if (
        run
        && run.traces.length === pairs.length
        && run.traces.every((trace, index) => (
          trace.sourceAsset.sha256 === pairs[index]?.sourceSha256
          && trace.outputAsset.sha256 === pairs[index]?.outputSha256
        ))
      ) {
        return run;
      }
    }
    return null;
  }

  attachSourceManifest(runId: string, path: string, sha256: string): void {
    this.connection.prepare(`
      UPDATE runs
      SET source_manifest_path = ?, source_manifest_sha256 = ?
      WHERE id = ? AND source_manifest_path IS NULL
    `).run(path, sha256, runId);
  }

  insertAsset(asset: NewAsset): StoredAsset {
    this.connection.prepare(`
      INSERT OR IGNORE INTO assets (
        id, sha256, original_name, media_type, byte_size, width, height, storage_name, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asset.id,
      asset.sha256,
      asset.originalName,
      asset.mediaType,
      asset.byteSize,
      asset.width,
      asset.height,
      asset.storageName,
      asset.createdAt,
    );

    const stored = this.getAssetBySha256(asset.sha256);
    if (!stored) {
      throw new Error(`Failed to persist asset ${asset.sha256}`);
    }
    return stored;
  }

  getAsset(id: string): StoredAsset | null {
    const row = this.connection.prepare('SELECT * FROM assets WHERE id = ?').get(id) as Row | undefined;
    return row ? this.mapAsset(row) : null;
  }

  getAssetBySha256(sha256: string): StoredAsset | null {
    const row = this.connection.prepare('SELECT * FROM assets WHERE sha256 = ?').get(sha256) as Row | undefined;
    return row ? this.mapAsset(row) : null;
  }

  insertRun(run: NewRun): void {
    this.connection.prepare(`
      INSERT INTO runs (
        id, source_manifest_path, source_manifest_sha256,
        title, prompt, prompt_status, character_id, style_id, target, produced_by, notes,
        character_snapshot_json, style_snapshot_json, rubric_json, import_warnings_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      run.id,
      run.sourceManifestPath,
      run.sourceManifestSha256,
      run.title,
      run.prompt,
      run.promptStatus,
      run.characterId,
      run.styleId,
      run.target,
      run.producedBy,
      run.notes,
      run.characterSnapshot === null ? null : JSON.stringify(run.characterSnapshot),
      run.styleSnapshot === null ? null : JSON.stringify(run.styleSnapshot),
      JSON.stringify(run.rubric),
      JSON.stringify(run.importWarnings),
      run.createdAt,
      run.createdAt,
    );
  }

  insertTrace(trace: NewTrace): void {
    this.connection.prepare(`
      INSERT INTO traces (
        id, run_id, ordinal, source_asset_id, output_asset_id, target, notes_json,
        source_metadata_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ungraded', ?)
    `).run(
      trace.id,
      trace.runId,
      trace.ordinal,
      trace.sourceAssetId,
      trace.outputAssetId,
      trace.target,
      JSON.stringify(trace.notes),
      trace.sourceMetadata === null ? null : JSON.stringify(trace.sourceMetadata),
      trace.createdAt,
    );
    this.connection.prepare(`
      INSERT INTO reviews (trace_id, scores_json, completed, updated_at)
      VALUES (?, '{}', 0, ?)
    `).run(trace.id, trace.createdAt);
  }

  listRuns(): RunSummary[] {
    const rows = this.connection.prepare(`
      SELECT
        r.*,
        COUNT(t.id) AS trace_count,
        COALESCE(SUM(CASE WHEN rv.completed = 1 THEN 1 ELSE 0 END), 0) AS graded_count
      FROM runs r
      LEFT JOIN traces t ON t.run_id = r.id
      LEFT JOIN reviews rv ON rv.trace_id = t.id
      GROUP BY r.id
      ORDER BY r.created_at DESC, r.title ASC
    `).all() as Row[];

    return rows.map((row) => this.mapRunSummary(row));
  }

  getRun(id: string): RunDetail | null {
    const row = this.connection.prepare(`
      SELECT
        r.*,
        COUNT(t.id) AS trace_count,
        COALESCE(SUM(CASE WHEN rv.completed = 1 THEN 1 ELSE 0 END), 0) AS graded_count
      FROM runs r
      LEFT JOIN traces t ON t.run_id = r.id
      LEFT JOIN reviews rv ON rv.trace_id = t.id
      WHERE r.id = ?
      GROUP BY r.id
    `).get(id) as Row | undefined;

    if (!row) {
      return null;
    }

    const traceRows = this.connection.prepare(`
      SELECT
        t.*,
        rv.scores_json,
        rv.completed,
        rv.updated_at AS review_updated_at,
        source.id AS source_id,
        source.sha256 AS source_sha256,
        source.original_name AS source_original_name,
        source.media_type AS source_media_type,
        source.byte_size AS source_byte_size,
        source.width AS source_width,
        source.height AS source_height,
        source.storage_name AS source_storage_name,
        source.created_at AS source_created_at,
        output.id AS output_id,
        output.sha256 AS output_sha256,
        output.original_name AS output_original_name,
        output.media_type AS output_media_type,
        output.byte_size AS output_byte_size,
        output.width AS output_width,
        output.height AS output_height,
        output.storage_name AS output_storage_name,
        output.created_at AS output_created_at
      FROM traces t
      JOIN reviews rv ON rv.trace_id = t.id
      JOIN assets source ON source.id = t.source_asset_id
      JOIN assets output ON output.id = t.output_asset_id
      WHERE t.run_id = ?
      ORDER BY t.ordinal ASC
    `).all(id) as Row[];

    const summary = this.mapRunSummary(row);
    return {
      ...summary,
      characterSnapshot: parseJson<Record<string, unknown> | string | null>(
        row.character_snapshot_json,
        null,
      ),
      styleSnapshot: parseJson<Record<string, unknown> | string | null>(
        row.style_snapshot_json,
        null,
      ),
      rubric: parseJson<RubricCriterion[]>(row.rubric_json, []),
      traces: traceRows.map((traceRow) => this.mapTrace(traceRow)),
    };
  }

  saveReview(traceId: string, input: ReviewInput, updatedAt: string): Review {
    const trace = this.getTraceRow(traceId);
    if (!trace) {
      throw new Error('TRACE_NOT_FOUND');
    }

    const status: TraceStatus = input.completed
      ? 'graded'
      : Object.keys(input.scores).length > 0
        ? 'draft'
        : this.annotationCount(traceId) > 0
          ? 'draft'
          : 'ungraded';

    this.transaction(() => {
      this.connection.prepare(`
        UPDATE reviews
        SET scores_json = ?, completed = ?, updated_at = ?
        WHERE trace_id = ?
      `).run(JSON.stringify(input.scores), input.completed ? 1 : 0, updatedAt, traceId);
      this.connection.prepare('UPDATE traces SET status = ? WHERE id = ?').run(status, traceId);
      this.touchRun(asString(trace.run_id), updatedAt);
    });

    return this.getReview(traceId);
  }

  createAnnotation(id: string, traceId: string, input: AnnotationInput, now: string): Annotation {
    const trace = this.getTraceRow(traceId);
    if (!trace) {
      throw new Error('TRACE_NOT_FOUND');
    }

    this.transaction(() => {
      this.connection.prepare(`
        INSERT INTO annotations (
          id, trace_id, asset_role, x, y, category, severity, note, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        traceId,
        input.assetRole,
        input.x,
        input.y,
        input.category,
        input.severity,
        input.note,
        now,
        now,
      );
      this.connection.prepare(`
        UPDATE traces SET status = CASE WHEN status = 'graded' THEN status ELSE 'draft' END WHERE id = ?
      `).run(traceId);
      this.touchRun(asString(trace.run_id), now);
    });

    const annotation = this.getAnnotation(id);
    if (!annotation) {
      throw new Error('Failed to persist annotation');
    }
    return annotation;
  }

  updateAnnotation(id: string, input: AnnotationInput, now: string): Annotation {
    const current = this.getAnnotationRow(id);
    if (!current) {
      throw new Error('ANNOTATION_NOT_FOUND');
    }

    this.transaction(() => {
      this.connection.prepare(`
        UPDATE annotations
        SET asset_role = ?, x = ?, y = ?, category = ?, severity = ?, note = ?, updated_at = ?
        WHERE id = ?
      `).run(
        input.assetRole,
        input.x,
        input.y,
        input.category,
        input.severity,
        input.note,
        now,
        id,
      );
      const trace = this.getTraceRow(asString(current.trace_id));
      if (trace) {
        this.touchRun(asString(trace.run_id), now);
      }
    });

    const annotation = this.getAnnotation(id);
    if (!annotation) {
      throw new Error('Failed to update annotation');
    }
    return annotation;
  }

  deleteAnnotation(id: string, now: string): boolean {
    const current = this.getAnnotationRow(id);
    if (!current) {
      return false;
    }
    const traceId = asString(current.trace_id);
    const trace = this.getTraceRow(traceId);

    this.transaction(() => {
      this.connection.prepare('DELETE FROM annotations WHERE id = ?').run(id);
      if (trace) {
        const review = this.getReview(traceId);
        if (!review.completed && Object.keys(review.scores).length === 0 && this.annotationCount(traceId) === 0) {
          this.connection.prepare("UPDATE traces SET status = 'ungraded' WHERE id = ?").run(traceId);
        }
        this.touchRun(asString(trace.run_id), now);
      }
    });
    return true;
  }

  getRubricForTrace(traceId: string): RubricCriterion[] | null {
    const row = this.connection.prepare(`
      SELECT r.rubric_json
      FROM traces t
      JOIN runs r ON r.id = t.run_id
      WHERE t.id = ?
    `).get(traceId) as Row | undefined;
    return row ? parseJson<RubricCriterion[]>(row.rubric_json, []) : null;
  }

  getRubricForAnnotation(annotationId: string): RubricCriterion[] | null {
    const row = this.connection.prepare(`
      SELECT r.rubric_json
      FROM annotations a
      JOIN traces t ON t.id = a.trace_id
      JOIN runs r ON r.id = t.run_id
      WHERE a.id = ?
    `).get(annotationId) as Row | undefined;
    return row ? parseJson<RubricCriterion[]>(row.rubric_json, []) : null;
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS assets (
        id TEXT PRIMARY KEY,
        sha256 TEXT NOT NULL UNIQUE,
        original_name TEXT NOT NULL,
        media_type TEXT NOT NULL CHECK (media_type IN ('image/png', 'image/jpeg')),
        byte_size INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        storage_name TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        prompt TEXT,
        prompt_status TEXT NOT NULL CHECK (prompt_status IN ('recorded', 'missing')),
        character_id TEXT,
        style_id TEXT,
        target TEXT,
        produced_by TEXT,
        notes TEXT,
        character_snapshot_json TEXT,
        style_snapshot_json TEXT,
        rubric_json TEXT NOT NULL,
        import_warnings_json TEXT NOT NULL DEFAULT '[]',
        source_manifest_path TEXT,
        source_manifest_sha256 TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        ordinal INTEGER NOT NULL,
        source_asset_id TEXT NOT NULL REFERENCES assets(id),
        output_asset_id TEXT NOT NULL REFERENCES assets(id),
        target TEXT,
        notes_json TEXT NOT NULL DEFAULT '[]',
        source_metadata_json TEXT,
        status TEXT NOT NULL CHECK (status IN ('ungraded', 'draft', 'graded')),
        created_at TEXT NOT NULL,
        UNIQUE (run_id, ordinal)
      );

      CREATE TABLE IF NOT EXISTS reviews (
        trace_id TEXT PRIMARY KEY REFERENCES traces(id) ON DELETE CASCADE,
        scores_json TEXT NOT NULL DEFAULT '{}',
        completed INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS annotations (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
        asset_role TEXT NOT NULL CHECK (asset_role IN ('source', 'output')),
        x REAL NOT NULL CHECK (x >= 0 AND x <= 1),
        y REAL NOT NULL CHECK (y >= 0 AND y <= 1),
        category TEXT NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
        note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS traces_run_id_idx ON traces(run_id);
      CREATE INDEX IF NOT EXISTS annotations_trace_id_idx ON annotations(trace_id);
    `);

    const runColumns = this.connection.prepare('PRAGMA table_info(runs)').all() as Row[];
    const columnNames = new Set(runColumns.map((row) => asString(row.name)));
    if (!columnNames.has('source_manifest_path')) {
      this.connection.exec('ALTER TABLE runs ADD COLUMN source_manifest_path TEXT');
    }
    if (!columnNames.has('source_manifest_sha256')) {
      this.connection.exec('ALTER TABLE runs ADD COLUMN source_manifest_sha256 TEXT');
    }
    this.connection.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS runs_source_manifest_idx
      ON runs(source_manifest_path, source_manifest_sha256)
      WHERE source_manifest_path IS NOT NULL AND source_manifest_sha256 IS NOT NULL
    `);
  }

  private mapAsset(row: Row, prefix = ''): StoredAsset {
    const id = asString(row[`${prefix}id`]);
    return {
      id,
      sha256: asString(row[`${prefix}sha256`]),
      originalName: asString(row[`${prefix}original_name`]),
      mediaType: asString(row[`${prefix}media_type`]) as Asset['mediaType'],
      byteSize: asNumber(row[`${prefix}byte_size`]),
      width: asNumber(row[`${prefix}width`]),
      height: asNumber(row[`${prefix}height`]),
      storageName: asString(row[`${prefix}storage_name`]),
      url: `/api/assets/${id}`,
      createdAt: asString(row[`${prefix}created_at`]),
    };
  }

  private mapRunSummary(row: Row): RunSummary {
    return {
      id: asString(row.id),
      title: asString(row.title),
      prompt: asNullableString(row.prompt),
      promptStatus: asString(row.prompt_status) as RunSummary['promptStatus'],
      characterId: asNullableString(row.character_id),
      styleId: asNullableString(row.style_id),
      target: asNullableString(row.target),
      producedBy: asNullableString(row.produced_by),
      notes: asNullableString(row.notes),
      traceCount: asNumber(row.trace_count),
      gradedCount: asNumber(row.graded_count),
      importWarnings: parseJson<string[]>(row.import_warnings_json, []),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  }

  private mapTrace(row: Row): Trace {
    const id = asString(row.id);
    return {
      id,
      runId: asString(row.run_id),
      ordinal: asNumber(row.ordinal),
      sourceAsset: this.mapAsset(row, 'source_'),
      outputAsset: this.mapAsset(row, 'output_'),
      target: asNullableString(row.target),
      notes: parseJson<string[]>(row.notes_json, []),
      sourceMetadata: parseJson<Record<string, unknown> | null>(row.source_metadata_json, null),
      status: asString(row.status) as TraceStatus,
      review: {
        traceId: id,
        scores: parseJson<Record<string, number>>(row.scores_json, {}),
        completed: asBoolean(row.completed),
        updatedAt: asString(row.review_updated_at),
        annotations: this.getAnnotations(id),
      },
      createdAt: asString(row.created_at),
    };
  }

  private getTraceRow(traceId: string): Row | null {
    return (this.connection.prepare('SELECT * FROM traces WHERE id = ?').get(traceId) as Row | undefined) ?? null;
  }

  private getReview(traceId: string): Review {
    const row = this.connection.prepare('SELECT * FROM reviews WHERE trace_id = ?').get(traceId) as Row | undefined;
    if (!row) {
      throw new Error('TRACE_NOT_FOUND');
    }
    return {
      traceId,
      scores: parseJson<Record<string, number>>(row.scores_json, {}),
      completed: asBoolean(row.completed),
      updatedAt: asString(row.updated_at),
      annotations: this.getAnnotations(traceId),
    };
  }

  private getAnnotations(traceId: string): Annotation[] {
    const rows = this.connection.prepare(`
      SELECT * FROM annotations WHERE trace_id = ? ORDER BY created_at ASC, id ASC
    `).all(traceId) as Row[];
    return rows.map((row) => this.mapAnnotation(row));
  }

  private getAnnotation(id: string): Annotation | null {
    const row = this.getAnnotationRow(id);
    return row ? this.mapAnnotation(row) : null;
  }

  private getAnnotationRow(id: string): Row | null {
    return (this.connection.prepare('SELECT * FROM annotations WHERE id = ?').get(id) as Row | undefined) ?? null;
  }

  private mapAnnotation(row: Row): Annotation {
    return {
      id: asString(row.id),
      traceId: asString(row.trace_id),
      assetRole: asString(row.asset_role) as Annotation['assetRole'],
      x: asNumber(row.x),
      y: asNumber(row.y),
      category: asString(row.category),
      severity: asString(row.severity) as Annotation['severity'],
      note: asString(row.note),
      createdAt: asString(row.created_at),
      updatedAt: asString(row.updated_at),
    };
  }

  private annotationCount(traceId: string): number {
    const row = this.connection.prepare('SELECT COUNT(*) AS count FROM annotations WHERE trace_id = ?').get(traceId) as Row;
    return asNumber(row.count);
  }

  private touchRun(runId: string, updatedAt: string): void {
    this.connection.prepare('UPDATE runs SET updated_at = ? WHERE id = ?').run(updatedAt, runId);
  }
}
