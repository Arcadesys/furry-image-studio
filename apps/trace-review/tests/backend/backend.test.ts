// @vitest-environment node

import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Annotation, RunDetail } from '../../shared/types.js';
import { createTraceReviewApp, type TraceReviewApp } from '../../server/app.js';
import type { CanonicalEvalBundleV1 } from '../../server/manifest.js';

let repoRoot: string;
let temporaryRoot: string;
let dataDir: string;
let casesDir: string;
let backend: TraceReviewApp;
let dogRun: RunDetail;

function digest(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function createLegacyFixtureRepo(root: string): Promise<void> {
  const sourceDir = join(root, 'evals/sources/selfies');
  const dogDir = join(root, 'evals/outputs/toon-dog');
  const mouseDir = join(root, 'evals/outputs/toon-mouse');
  await Promise.all([
    mkdir(sourceDir, { recursive: true }),
    mkdir(dogDir, { recursive: true }),
    mkdir(mouseDir, { recursive: true }),
    mkdir(join(root, 'assets/characters/testy-taupin'), { recursive: true }),
    mkdir(join(root, 'assets/styles'), { recursive: true }),
  ]);

  await Promise.all([
    writeFile(join(root, 'assets/characters/testy-taupin/character.md'), [
      '---',
      'id: testy-taupin',
      'display_name: Testy Taupin',
      '---',
      '',
      '# Testy Taupin',
      '',
    ].join('\n')),
    writeFile(join(root, 'assets/styles/toon-in-real-world.md'), [
      '---',
      'id: toon-in-real-world',
      'display_name: Toon in Real World',
      '---',
      '',
      '# Toon in Real World',
      '',
    ].join('\n')),
  ]);

  const image = await sharp({
    create: {
      width: 32,
      height: 24,
      channels: 3,
      background: { r: 42, g: 80, b: 96 },
    },
  }).png().toBuffer();
  const sourceNames = [
    '01-single-indoor-arcade.png',
    '02-pair-golden-hour.png',
    '03-four-midday.png',
    '04-six-fluorescent-indoor.png',
    '05-ten-sodium-bar.png',
  ];
  const dogNames = sourceNames.map((name) => name.replace('.png', '-dog.png'));
  const mouseNames = [
    ...sourceNames.map((name) => name.replace('.png', '-mouse.png')),
    '05-ten-sodium-bar-mouse-ink-outline.png',
  ];

  await Promise.all([
    ...sourceNames.map((name) => writeFile(join(sourceDir, name), image)),
    ...dogNames.map((name) => writeFile(join(dogDir, name), image)),
    ...mouseNames.map((name) => writeFile(join(mouseDir, name), image)),
    writeFile(join(dogDir, '05-ten-sodium-bar-mouse-ink-outline.png'), image),
  ]);

  const outputs = (names: string[]) => names.map((output, index) => ({
    source: `../../sources/selfies/${sourceNames[Math.min(index, sourceNames.length - 1)]}`,
    output,
    target: index === 0 ? 'only foreground subject' : 'foreground subject',
    notes: ['fixture trace'],
  }));
  await Promise.all([
    writeFile(join(dogDir, 'manifest.json'), JSON.stringify({
      description: 'Synthetic dog fixture',
      character: { species: 'anthropomorphic dog' },
      style: 'toon-in-real-world',
      outputs: outputs(dogNames),
    })),
    writeFile(join(mouseDir, 'manifest.json'), JSON.stringify({
      description: 'Synthetic mouse fixture',
      character: { species: 'anthropomorphic mouse' },
      style: 'toon-in-real-world',
      outputs: outputs(mouseNames),
    })),
    writeFile(join(sourceDir, 'manifest.json'), JSON.stringify({
      images: sourceNames.map((file, index) => ({ file, subject_count: index + 1 })),
    })),
  ]);
}

describe.sequential('trace review backend', () => {
  beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'furry-trace-review-'));
    repoRoot = join(temporaryRoot, 'repo');
    await createLegacyFixtureRepo(repoRoot);
    dataDir = join(temporaryRoot, 'data');
    casesDir = join(temporaryRoot, 'cases');
    backend = await createTraceReviewApp({
      repoRoot,
      dataDir,
      evalCasesDir: casesDir,
      now: () => new Date('2026-07-28T20:00:00.000Z'),
    });
  }, 60_000);

  afterAll(async () => {
    await backend.app.close();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('imports the two historical manifests as 2 runs and 11 traces, with the stray dog-folder mouse output flagged', async () => {
    const response = await backend.app.inject({ method: 'GET', url: '/api/bootstrap' });
    expect(response.statusCode).toBe(200);
    const body = response.json<{
      runs: Array<{ id: string; title: string; traceCount: number; prompt: string | null; importWarnings: string[] }>;
      characters: Array<{ id: string }>;
      styles: Array<{ id: string }>;
    }>();

    expect(body.runs).toHaveLength(2);
    expect(body.runs.reduce((count, run) => count + run.traceCount, 0)).toBe(11);
    expect(body.runs.every((run) => run.prompt === null)).toBe(true);
    expect(body.characters.some((profile) => profile.id === 'testy-taupin')).toBe(true);
    expect(body.styles.some((profile) => profile.id === 'toon-in-real-world')).toBe(true);

    const dogSummary = body.runs.find((run) => run.title === 'Toon Dog');
    expect(dogSummary?.traceCount).toBe(5);
    expect(dogSummary?.importWarnings).toContain(
      'Orphan output image: 05-ten-sodium-bar-mouse-ink-outline.png',
    );
    const mouseSummary = body.runs.find((run) => run.title === 'Toon Mouse');
    expect(mouseSummary?.traceCount).toBe(6);
    expect(mouseSummary?.importWarnings).toEqual([]);

    const detailResponse = await backend.app.inject({
      method: 'GET',
      url: `/api/runs/${dogSummary?.id}`,
    });
    dogRun = detailResponse.json<RunDetail>();
    expect(dogRun.traces).toHaveLength(5);
    expect(dogRun.traces.every((trace) => trace.sourceAsset.url.startsWith('/api/assets/'))).toBe(true);
  });

  it('discovers new pipeline folders incrementally without duplicating known manifests', async () => {
    const foxDir = join(repoRoot, 'evals/outputs/toon-fox');
    const sourceName = '01-single-indoor-arcade.png';
    await mkdir(foxDir, { recursive: true });
    await copyFile(
      join(repoRoot, 'evals/sources/selfies', sourceName),
      join(foxDir, '01-single-indoor-arcade-fox.png'),
    );
    await writeFile(join(foxDir, 'manifest.json'), JSON.stringify({
      description: 'Synthetic fox fixture',
      character: { species: 'anthropomorphic fox' },
      style: 'toon-in-real-world',
      outputs: [{
        source: `../../sources/selfies/${sourceName}`,
        output: '01-single-indoor-arcade-fox.png',
        target: 'only foreground subject',
        notes: ['fixture trace'],
      }],
    }));

    await backend.importer.syncExistingEvalOutputs();
    expect(backend.database.listRuns()).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Toon Fox', traceCount: 1 })]),
    );
    expect(backend.database.countRuns()).toBe(3);

    await backend.importer.syncExistingEvalOutputs();
    expect(backend.database.countRuns()).toBe(3);
  });

  it('starts with an empty workspace when optional sample manifests are absent', async () => {
    const emptyRoot = await mkdtemp(join(tmpdir(), 'furry-trace-empty-'));
    const emptyBackend = await createTraceReviewApp({
      repoRoot: emptyRoot,
      dataDir: join(emptyRoot, 'data'),
      evalCasesDir: join(emptyRoot, 'cases'),
    });
    try {
      const response = await emptyBackend.app.inject({ method: 'GET', url: '/api/runs' });
      expect(response.statusCode).toBe(200);
      expect(response.json<{ runs: unknown[] }>().runs).toEqual([]);
    } finally {
      await emptyBackend.app.close();
      await rm(emptyRoot, { recursive: true, force: true });
    }
  });

  it('deduplicates identical image content', async () => {
    const sourcePath = join(repoRoot, 'evals/sources/selfies/01-single-indoor-arcade.png');
    const first = await backend.assets.ingestFile(sourcePath, 'first-name.png');
    const countAfterFirst = backend.database.countAssets();
    const second = await backend.assets.ingestFile(sourcePath, 'second-name.png');

    expect(second.id).toBe(first.id);
    expect(second.sha256).toBe(first.sha256);
    expect(backend.database.countAssets()).toBe(countAfterFirst);
  });

  it('persists review scores and annotations after the database reopens', async () => {
    const trace = dogRun.traces[0];
    const scores = Object.fromEntries(dogRun.rubric.map((criterion) => [criterion.id, 4]));
    const reviewResponse = await backend.app.inject({
      method: 'PUT',
      url: `/api/traces/${trace.id}/review`,
      payload: { scores, completed: true },
    });
    expect(reviewResponse.statusCode).toBe(200);

    const annotationResponse = await backend.app.inject({
      method: 'POST',
      url: `/api/traces/${trace.id}/annotations`,
      payload: {
        assetRole: 'output',
        x: 0.25,
        y: 0.75,
        category: 'paws-anatomy',
        severity: 'high',
        note: 'Claw count does not match the profile.',
      },
    });
    expect(annotationResponse.statusCode).toBe(201);
    const annotation = annotationResponse.json<Annotation>();

    const invalidUpdate = await backend.app.inject({
      method: 'PUT',
      url: `/api/annotations/${annotation.id}`,
      payload: {
        assetRole: 'source',
        x: 0.5,
        y: 0.5,
        category: 'not-in-this-rubric',
        severity: 'low',
        note: 'This category should be rejected.',
      },
    });
    expect(invalidUpdate.statusCode).toBe(400);

    await backend.app.close();
    backend = await createTraceReviewApp({
      repoRoot,
      dataDir,
      evalCasesDir: casesDir,
      now: () => new Date('2026-07-28T20:00:00.000Z'),
    });
    const reopened = await backend.app.inject({
      method: 'GET',
      url: `/api/runs/${dogRun.id}`,
    });
    const persisted = reopened.json<RunDetail>();
    const persistedTrace = persisted.traces.find((candidate) => candidate.id === trace.id);

    expect(persistedTrace?.status).toBe('graded');
    expect(persistedTrace?.review.scores).toEqual(scores);
    expect(persistedTrace?.review.annotations).toEqual(
      expect.arrayContaining([expect.objectContaining({
        id: annotation.id,
        x: 0.25,
        y: 0.75,
        note: 'Claw count does not match the profile.',
      })]),
    );
    dogRun = persisted;
  });

  it('exports an immutable EvalBundleV1 whose recorded checksums match every payload file', async () => {
    const response = await backend.app.inject({
      method: 'POST',
      url: `/api/runs/${dogRun.id}/export`,
    });
    expect(response.statusCode).toBe(201);
    const result = response.json<{ exportPath: string; bundle: CanonicalEvalBundleV1 }>();
    expect(result.exportPath.startsWith(casesDir)).toBe(true);
    expect(result.bundle.schemaVersion).toBe(1);
    expect(result.bundle.traces).toHaveLength(5);
    expect(Object.keys(result.bundle.checksums)).toEqual(
      expect.arrayContaining([
        'prompt.txt',
        'profiles/character.json',
        'profiles/style.json',
        'rubric.json',
        'reviews.json',
      ]),
    );

    const diskManifest = JSON.parse(
      await readFile(join(result.exportPath, 'manifest.json'), 'utf8'),
    ) as CanonicalEvalBundleV1;
    expect(diskManifest).toEqual(result.bundle);
    expect(diskManifest.title).toBe('Toon Dog');
    expect(diskManifest.prompt).toBeNull();
    expect(diskManifest.promptStatus).toBe('missing');
    expect(diskManifest.traces[0]?.review.annotations).toHaveLength(1);

    for (const [relativePath, expected] of Object.entries(result.bundle.checksums)) {
      expect(digest(await readFile(join(result.exportPath, relativePath)))).toBe(expected);
    }

    const secondResponse = await backend.app.inject({
      method: 'POST',
      url: `/api/runs/${dogRun.id}/export`,
    });
    expect(secondResponse.statusCode).toBe(409);
    expect(await readFile(join(result.exportPath, 'manifest.json'), 'utf8')).toBe(
      `${JSON.stringify(result.bundle, null, 2)}\n`,
    );

    const roundTripRoot = await mkdtemp(join(tmpdir(), 'furry-trace-roundtrip-'));
    const roundTrip = await createTraceReviewApp({
      repoRoot,
      dataDir: join(roundTripRoot, 'data'),
      evalCasesDir: join(roundTripRoot, 'cases'),
    });
    try {
      const imported = await roundTrip.importer.importManifest(
        join(result.exportPath, 'manifest.json'),
      );
      expect(imported.promptStatus).toBe('missing');
      expect(imported.traces).toHaveLength(5);
      expect(imported.traces[0]?.sourceMetadata).toEqual(dogRun.traces[0]?.sourceMetadata);
      expect(imported.traces[0]?.review.scores).toEqual(dogRun.traces[0]?.review.scores);
      expect(imported.traces[0]?.review.annotations[0]).toEqual(
        expect.objectContaining({
          x: 0.25,
          y: 0.75,
          note: 'Claw count does not match the profile.',
        }),
      );
    } finally {
      await roundTrip.app.close();
      await rm(roundTripRoot, { recursive: true, force: true });
    }
  });

  it('rejects canonical trace paths that escape the manifest import folder', async () => {
    const importRoot = join(temporaryRoot, 'escape-case');
    const manifestDir = join(importRoot, 'case');
    await mkdir(manifestDir, { recursive: true });
    const sourceImage = join(repoRoot, 'evals/sources/selfies/01-single-indoor-arcade.png');
    await copyFile(sourceImage, join(importRoot, 'outside.png'));
    await copyFile(sourceImage, join(manifestDir, 'output.png'));
    const manifestPath = join(manifestDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify({
      schemaVersion: 1,
      title: 'Traversal attempt',
      prompt: null,
      promptStatus: 'missing',
      character: null,
      style: null,
      target: null,
      producedBy: null,
      notes: null,
      traces: [{
        source: '../outside.png',
        output: 'output.png',
        metadata: { arbitraryPipelineField: { preserved: true } },
      }],
    }));

    await expect(backend.importer.importManifest(manifestPath)).rejects.toThrow(
      'Trace asset path escapes its import root',
    );
  });
});
