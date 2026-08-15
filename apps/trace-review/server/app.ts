import { randomUUID } from 'node:crypto';
import { createReadStream, existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { z, ZodError } from 'zod';
import type {
  AnnotationInput,
  BootstrapResponse,
  RubricCriterion,
} from '../shared/types.js';
import { AssetStore } from './assets.js';
import { StudioDatabase } from './database.js';
import { BundleExporter } from './exporter.js';
import { ManifestImporter } from './importer.js';
import { loadProfiles } from './profiles.js';

const idParamsSchema = z.object({ id: z.string().uuid() });
const runParamsSchema = z.object({ runId: z.string().uuid() });
const traceParamsSchema = z.object({ traceId: z.string().uuid() });
const reviewSchema = z.object({
  scores: z.record(z.string(), z.number().int().min(1).max(5)),
  completed: z.boolean(),
});
const annotationSchema = z.object({
  assetRole: z.enum(['source', 'output']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  category: z.string().trim().min(1).max(100),
  severity: z.enum(['low', 'medium', 'high']),
  note: z.string().trim().min(1).max(2_000),
});
export interface AppOptions {
  repoRoot: string;
  dataDir?: string;
  evalCasesDir?: string;
  serveStatic?: boolean;
  now?: () => Date;
  logger?: boolean;
}

export interface TraceReviewApp {
  app: FastifyInstance;
  database: StudioDatabase;
  assets: AssetStore;
  importer: ManifestImporter;
  exporter: BundleExporter;
}

function validateReviewAgainstRubric(
  scores: Record<string, number>,
  completed: boolean,
  rubric: RubricCriterion[],
): void {
  const rubricIds = new Set(rubric.map((criterion) => criterion.id));
  const unknown = Object.keys(scores).filter((id) => !rubricIds.has(id));
  if (unknown.length > 0) {
    throw new Error(`Unknown rubric criteria: ${unknown.join(', ')}`);
  }
  if (completed) {
    const missing = rubric.filter((criterion) => scores[criterion.id] === undefined);
    if (missing.length > 0) {
      throw new Error(`Completed review is missing scores: ${missing.map((item) => item.label).join(', ')}`);
    }
  }
}

export async function createTraceReviewApp(options: AppOptions): Promise<TraceReviewApp> {
  const repoRoot = resolve(options.repoRoot);
  const dataDir = resolve(options.dataDir ?? join(repoRoot, '.furry-image-studio'));
  const evalCasesDir = resolve(options.evalCasesDir ?? join(repoRoot, 'evals', 'cases'));
  await mkdir(dataDir, { recursive: true });

  const database = new StudioDatabase(join(dataDir, 'studio.sqlite'));
  const assets = new AssetStore(database, dataDir);
  const importer = new ManifestImporter(repoRoot, database, assets);
  const exporter = new BundleExporter(database, assets, evalCasesDir, options.now);
  const app = Fastify({ logger: options.logger ?? false });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'Invalid request', issues: error.issues });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    if (
      message === 'TRACE_NOT_FOUND'
      || message === 'ANNOTATION_NOT_FOUND'
      || message === 'RUN_NOT_FOUND'
    ) {
      return reply.code(404).send({ error: message });
    }
    if (
      message.startsWith('Unknown ')
      || message.startsWith('Completed review')
      || message.startsWith('Unsupported')
      || message.startsWith('Only PNG')
      || message.startsWith('Image ')
      || message.startsWith('Trace asset')
      || message.startsWith('Checksum')
    ) {
      return reply.code(400).send({ error: message });
    }
    if (
      error instanceof Error
      && 'code' in error
      && (error.code === 'EEXIST' || error.code === 'ENOTEMPTY')
    ) {
      return reply.code(409).send({ error: 'An export already exists at this timestamp' });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'Internal server error' });
  });

  await importer.syncExistingEvalOutputs();

  app.get('/api/health', async () => ({ ok: true, mode: 'review-existing-evals' }));

  app.get('/api/bootstrap', async (): Promise<BootstrapResponse> => {
    const profiles = await loadProfiles(repoRoot);
    return {
      runs: database.listRuns(),
      characters: profiles.characters,
      styles: profiles.styles,
    };
  });

  app.get('/api/runs', async () => ({ runs: database.listRuns() }));

  app.get('/api/runs/:runId', async (request, reply) => {
    const { runId } = runParamsSchema.parse(request.params);
    const run = database.getRun(runId);
    return run ?? reply.code(404).send({ error: 'RUN_NOT_FOUND' });
  });

  app.put('/api/traces/:traceId/review', async (request) => {
    const { traceId } = traceParamsSchema.parse(request.params);
    const input = reviewSchema.parse(request.body);
    const rubric = database.getRubricForTrace(traceId);
    if (!rubric) {
      throw new Error('TRACE_NOT_FOUND');
    }
    validateReviewAgainstRubric(input.scores, input.completed, rubric);
    return database.saveReview(traceId, input, (options.now?.() ?? new Date()).toISOString());
  });

  app.post('/api/traces/:traceId/annotations', async (request, reply) => {
    const { traceId } = traceParamsSchema.parse(request.params);
    const input = annotationSchema.parse(request.body) as AnnotationInput;
    const rubric = database.getRubricForTrace(traceId);
    if (!rubric) {
      throw new Error('TRACE_NOT_FOUND');
    }
    if (!rubric.some((criterion) => criterion.id === input.category)) {
      throw new Error(`Unknown rubric criteria: ${input.category}`);
    }
    const annotation = database.createAnnotation(
      randomUUID(),
      traceId,
      input,
      (options.now?.() ?? new Date()).toISOString(),
    );
    return reply.code(201).send(annotation);
  });

  app.put('/api/annotations/:id', async (request) => {
    const { id } = idParamsSchema.parse(request.params);
    const input = annotationSchema.parse(request.body) as AnnotationInput;
    const rubric = database.getRubricForAnnotation(id);
    if (!rubric) {
      throw new Error('ANNOTATION_NOT_FOUND');
    }
    if (!rubric.some((criterion) => criterion.id === input.category)) {
      throw new Error(`Unknown rubric criteria: ${input.category}`);
    }
    return database.updateAnnotation(
      id,
      input,
      (options.now?.() ?? new Date()).toISOString(),
    );
  });

  app.delete('/api/annotations/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const deleted = database.deleteAnnotation(id, (options.now?.() ?? new Date()).toISOString());
    return deleted
      ? reply.code(204).send()
      : reply.code(404).send({ error: 'ANNOTATION_NOT_FOUND' });
  });

  app.post('/api/runs/:runId/export', async (request, reply) => {
    const { runId } = runParamsSchema.parse(request.params);
    const result = await exporter.exportRun(runId);
    return reply.code(201).send(result);
  });

  app.get('/api/assets/:id', async (request, reply) => {
    const { id } = idParamsSchema.parse(request.params);
    const asset = database.getAsset(id);
    if (!asset) {
      return reply.code(404).send({ error: 'ASSET_NOT_FOUND' });
    }
    reply.header('Cache-Control', 'private, max-age=31536000, immutable');
    reply.type(asset.mediaType);
    return reply.send(createReadStream(assets.resolveStoredPath(asset)));
  });

  if (options.serveStatic) {
    const distDir = join(repoRoot, 'apps', 'trace-review', 'dist');
    if (existsSync(distDir)) {
      await app.register(fastifyStatic, { root: distDir, prefix: '/' });
      app.setNotFoundHandler((request, reply) => {
        if (request.method === 'GET' && !request.url.startsWith('/api/')) {
          return reply.sendFile('index.html');
        }
        return reply.code(404).send({ error: 'NOT_FOUND' });
      });
    } else {
      app.log.warn(`Vite dist not found at ${distDir}; serving API only`);
    }
  }

  app.addHook('onClose', async () => {
    database.close();
  });

  return { app, database, assets, importer, exporter };
}
