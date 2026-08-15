import { env } from "cloudflare:workers";
import seed from "../generated/eval-data.json";
import type {
  Annotation,
  AnnotationInput,
  BootstrapResponse,
  Review,
  ReviewInput,
  RunDetail,
  RunSummary,
  Trace,
} from "../../trace-review/shared/types";

interface ReviewRow {
  trace_id: string;
  scores_json: string;
  completed: number;
  updated_at: string;
}

interface AnnotationRow {
  id: string;
  trace_id: string;
  asset_role: "source" | "output";
  x: number;
  y: number;
  category: string;
  severity: "low" | "medium" | "high";
  note: string;
  created_at: string;
  updated_at: string;
}

const seededBootstrap = seed.bootstrap as unknown as BootstrapResponse;
const seededRuns = seed.runs as unknown as Record<string, RunDetail>;
const traceToRun = new Map<string, RunDetail>();
for (const run of Object.values(seededRuns)) {
  for (const trace of run.traces) traceToRun.set(trace.id, run);
}

let schemaReady: Promise<void> | null = null;

function database(): D1Database {
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) throw new Error("Hosted review storage is unavailable.");
  return binding;
}

async function ensureSchema(): Promise<void> {
  schemaReady ??= database().batch([
    database().prepare(`
      CREATE TABLE IF NOT EXISTS trace_reviews (
        trace_id TEXT PRIMARY KEY,
        scores_json TEXT NOT NULL DEFAULT '{}',
        completed INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      )
    `),
    database().prepare(`
      CREATE TABLE IF NOT EXISTS trace_annotations (
        id TEXT PRIMARY KEY,
        trace_id TEXT NOT NULL,
        asset_role TEXT NOT NULL,
        x REAL NOT NULL,
        y REAL NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    database().prepare(`
      CREATE INDEX IF NOT EXISTS trace_annotations_trace_id_idx
      ON trace_annotations(trace_id)
    `),
  ]).then(() => undefined);
  return schemaReady;
}

function parseScores(value: string): Record<string, number> {
  try {
    return JSON.parse(value) as Record<string, number>;
  } catch {
    return {};
  }
}

function mapAnnotation(row: AnnotationRow): Annotation {
  return {
    id: row.id,
    traceId: row.trace_id,
    assetRole: row.asset_role,
    x: row.x,
    y: row.y,
    category: row.category,
    severity: row.severity,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function placeholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function reviewRows(traceIds: string[]): Promise<ReviewRow[]> {
  if (traceIds.length === 0) return [];
  const result = await database()
    .prepare(`SELECT * FROM trace_reviews WHERE trace_id IN (${placeholders(traceIds.length)})`)
    .bind(...traceIds)
    .all<ReviewRow>();
  return result.results ?? [];
}

async function annotationRows(traceIds: string[]): Promise<AnnotationRow[]> {
  if (traceIds.length === 0) return [];
  const result = await database()
    .prepare(`
      SELECT *
      FROM trace_annotations
      WHERE trace_id IN (${placeholders(traceIds.length)})
      ORDER BY created_at ASC, id ASC
    `)
    .bind(...traceIds)
    .all<AnnotationRow>();
  return result.results ?? [];
}

function validateReview(run: RunDetail, input: ReviewInput): void {
  const rubricIds = new Set(run.rubric.map((criterion) => criterion.id));
  for (const [criterionId, score] of Object.entries(input.scores)) {
    if (!rubricIds.has(criterionId) || !Number.isInteger(score) || score < 1 || score > 5) {
      throw new Error("Review scores do not match this rubric.");
    }
  }
  if (input.completed && run.rubric.some((criterion) => input.scores[criterion.id] === undefined)) {
    throw new Error("Completed reviews require every rubric score.");
  }
}

function validateAnnotation(run: RunDetail, input: AnnotationInput): void {
  if (!run.rubric.some((criterion) => criterion.id === input.category)) {
    throw new Error("Annotation category does not match this rubric.");
  }
  if (
    !["source", "output"].includes(input.assetRole)
    || !["low", "medium", "high"].includes(input.severity)
    || !Number.isFinite(input.x)
    || !Number.isFinite(input.y)
    || input.x < 0
    || input.x > 1
    || input.y < 0
    || input.y > 1
    || !input.note.trim()
  ) {
    throw new Error("Annotation evidence is incomplete.");
  }
}

export async function getBootstrap(): Promise<BootstrapResponse> {
  await ensureSchema();
  const result = await database()
    .prepare("SELECT trace_id FROM trace_reviews WHERE completed = 1")
    .all<{ trace_id: string }>();
  const completed = new Set((result.results ?? []).map((row) => row.trace_id));
  const runs: RunSummary[] = seededBootstrap.runs.map((summary) => {
    const run = seededRuns[summary.id];
    return {
      ...summary,
      gradedCount: run?.traces.filter((trace) => completed.has(trace.id)).length ?? 0,
    };
  });
  return {
    ...seededBootstrap,
    runs,
  };
}

export async function getRun(runId: string): Promise<RunDetail | null> {
  const seeded = seededRuns[runId];
  if (!seeded) return null;
  await ensureSchema();

  const traceIds = seeded.traces.map((trace) => trace.id);
  const [reviews, annotations] = await Promise.all([
    reviewRows(traceIds),
    annotationRows(traceIds),
  ]);
  const reviewsByTrace = new Map(reviews.map((review) => [review.trace_id, review]));
  const annotationsByTrace = new Map<string, Annotation[]>();
  for (const row of annotations) {
    const current = annotationsByTrace.get(row.trace_id) ?? [];
    current.push(mapAnnotation(row));
    annotationsByTrace.set(row.trace_id, current);
  }

  const traces: Trace[] = seeded.traces.map((trace) => {
    const storedReview = reviewsByTrace.get(trace.id);
    const traceAnnotations = annotationsByTrace.get(trace.id) ?? trace.review.annotations;
    const scores = storedReview ? parseScores(storedReview.scores_json) : trace.review.scores;
    const completed = storedReview ? storedReview.completed === 1 : trace.review.completed;
    const status = completed
      ? "graded"
      : Object.keys(scores).length > 0 || traceAnnotations.length > 0
        ? "draft"
        : "ungraded";
    return {
      ...trace,
      status,
      review: {
        traceId: trace.id,
        scores,
        completed,
        updatedAt: storedReview?.updated_at ?? trace.review.updatedAt,
        annotations: traceAnnotations,
      },
    };
  });

  return {
    ...seeded,
    gradedCount: traces.filter((trace) => trace.status === "graded").length,
    updatedAt: traces
      .map((trace) => trace.review.updatedAt)
      .sort()
      .at(-1) ?? seeded.updatedAt,
    traces,
  };
}

export async function saveReview(traceId: string, input: ReviewInput): Promise<Review> {
  const run = traceToRun.get(traceId);
  if (!run) throw new Error("TRACE_NOT_FOUND");
  validateReview(run, input);
  await ensureSchema();
  const updatedAt = new Date().toISOString();
  await database().prepare(`
    INSERT INTO trace_reviews (trace_id, scores_json, completed, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(trace_id) DO UPDATE SET
      scores_json = excluded.scores_json,
      completed = excluded.completed,
      updated_at = excluded.updated_at
  `).bind(
    traceId,
    JSON.stringify(input.scores),
    input.completed ? 1 : 0,
    updatedAt,
  ).run();

  const annotations = (await annotationRows([traceId])).map(mapAnnotation);
  return { traceId, scores: input.scores, completed: input.completed, updatedAt, annotations };
}

export async function addAnnotation(
  traceId: string,
  input: AnnotationInput,
): Promise<Annotation> {
  const run = traceToRun.get(traceId);
  if (!run) throw new Error("TRACE_NOT_FOUND");
  validateAnnotation(run, input);
  await ensureSchema();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database().prepare(`
    INSERT INTO trace_annotations (
      id, trace_id, asset_role, x, y, category, severity, note, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    traceId,
    input.assetRole,
    input.x,
    input.y,
    input.category,
    input.severity,
    input.note.trim(),
    now,
    now,
  ).run();
  return { id, traceId, ...input, note: input.note.trim(), createdAt: now, updatedAt: now };
}

export async function updateAnnotation(
  id: string,
  input: AnnotationInput,
): Promise<Annotation> {
  await ensureSchema();
  const existing = await database()
    .prepare("SELECT * FROM trace_annotations WHERE id = ?")
    .bind(id)
    .first<AnnotationRow>();
  if (!existing) throw new Error("ANNOTATION_NOT_FOUND");
  const run = traceToRun.get(existing.trace_id);
  if (!run) throw new Error("TRACE_NOT_FOUND");
  validateAnnotation(run, input);
  const updatedAt = new Date().toISOString();
  await database().prepare(`
    UPDATE trace_annotations
    SET asset_role = ?, x = ?, y = ?, category = ?, severity = ?, note = ?, updated_at = ?
    WHERE id = ?
  `).bind(
    input.assetRole,
    input.x,
    input.y,
    input.category,
    input.severity,
    input.note.trim(),
    updatedAt,
    id,
  ).run();
  return {
    id,
    traceId: existing.trace_id,
    ...input,
    note: input.note.trim(),
    createdAt: existing.created_at,
    updatedAt,
  };
}

export async function deleteAnnotation(id: string): Promise<boolean> {
  await ensureSchema();
  const existing = await database()
    .prepare("SELECT id FROM trace_annotations WHERE id = ?")
    .bind(id)
    .first<{ id: string }>();
  if (!existing) return false;
  await database().prepare("DELETE FROM trace_annotations WHERE id = ?").bind(id).run();
  return true;
}
