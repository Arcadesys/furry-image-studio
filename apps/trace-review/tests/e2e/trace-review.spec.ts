import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const now = '2026-07-28T15:42:00.000Z';
const runId = '00000000-0000-4000-8000-000000000010';
const rubric = [
  { id: 'target-selection', label: 'Target selection', passThreshold: 4 },
  { id: 'character-fidelity', label: 'Character fidelity', passThreshold: 4 },
  { id: 'background-preservation', label: 'Background preservation', passThreshold: 4 },
  { id: 'paws-anatomy', label: 'Paws and anatomy', passThreshold: 4 },
  { id: 'lighting-color', label: 'Lighting and color', passThreshold: 4 },
];

function trace(ordinal: number) {
  const traceId = `00000000-0000-4000-8000-00000000000${ordinal}`;
  return {
    id: traceId,
    runId,
    ordinal,
    sourceAsset: {
      id: `source-${ordinal}`,
      sha256: `source-${ordinal}`,
      originalName: 'source.png',
      mediaType: 'image/png',
      byteSize: 100,
      width: 1448,
      height: 1086,
      url: '/fixtures/source.png',
      createdAt: now,
    },
    outputAsset: {
      id: `output-${ordinal}`,
      sha256: `output-${ordinal}`,
      originalName: `output-${ordinal}.png`,
      mediaType: 'image/png',
      byteSize: 100,
      width: 1448,
      height: 1086,
      url: `/fixtures/output-${ordinal}.png`,
      createdAt: now,
    },
    target: 'Front-left subject',
    notes: [],
    sourceMetadata: null,
    status: 'ungraded',
    review: {
      traceId,
      scores: {},
      completed: false,
      updatedAt: now,
      annotations: [],
    },
    createdAt: now,
  };
}

const traces = Array.from({ length: 5 }, (_, index) => trace(index + 1));
const run = {
  id: runId,
  title: 'Grey mouse / sodium bar',
  prompt: 'Transform only the front-left subject into a cartoony grey-furred mouse. Preserve everyone else and the real background.',
  promptStatus: 'recorded',
  characterId: 'grey-mouse',
  styleId: 'toon-in-real-world',
  target: 'Front-left subject',
  producedBy: 'External pipeline',
  notes: 'Crowd and white-balance evaluation',
  traceCount: 5,
  gradedCount: 0,
  importWarnings: [],
  createdAt: now,
  updatedAt: now,
  characterSnapshot: { species: 'anthropomorphic mouse' },
  styleSnapshot: 'Toon in real world',
  rubric,
  traces,
};

async function mockWorkspace(page: Page) {
  const source = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
    + '<rect width="800" height="600" fill="#3b2514"/>'
    + '<circle cx="250" cy="230" r="110" fill="#f2b38b"/>'
    + '<rect x="170" y="340" width="300" height="220" fill="#20272f"/>'
    + '</svg>',
  );
  const output = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">'
    + '<rect width="800" height="600" fill="#3b2514"/>'
    + '<circle cx="250" cy="230" r="120" fill="#9aa0a5"/>'
    + '<circle cx="150" cy="125" r="70" fill="#d9a2a7"/>'
    + '<circle cx="350" cy="125" r="70" fill="#d9a2a7"/>'
    + '</svg>',
  );

  await page.route('**/fixtures/source.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: source }),
  );
  await page.route('**/fixtures/output-*.png', (route) =>
    route.fulfill({ status: 200, contentType: 'image/svg+xml', body: output }),
  );
  await page.route('**/api/bootstrap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runs: [{
          id: run.id,
          title: run.title,
          prompt: run.prompt,
          promptStatus: run.promptStatus,
          characterId: run.characterId,
          styleId: run.styleId,
          target: run.target,
          producedBy: run.producedBy,
          notes: run.notes,
          traceCount: run.traceCount,
          gradedCount: run.gradedCount,
          importWarnings: [],
          createdAt: now,
          updatedAt: now,
        }],
        characters: [{ id: 'grey-mouse', displayName: 'Grey mouse', raw: 'species: mouse' }],
        styles: [{ id: 'toon-in-real-world', displayName: 'Toon in real world', raw: 'style: toon' }],
      }),
    }),
  );
  await page.route(`**/api/runs/${runId}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(run) }),
  );
  await page.route('**/api/traces/*/review', async (route) => {
    const input = route.request().postDataJSON() as { scores: Record<string, number>; completed: boolean };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        traceId: traces[0].id,
        scores: input.scores,
        completed: input.completed,
        updatedAt: new Date().toISOString(),
        annotations: [],
      }),
    });
  });
  await page.route('**/api/traces/*/annotations', async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        ...input,
        id: '10000000-0000-4000-8000-000000000001',
        traceId: traces[0].id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    });
  });
}

if (process.env.VITEST) {
  const vitest = await import('vitest');
  vitest.describe.skip('Playwright browser cases', () => {
    vitest.it('runs through the Playwright command', () => undefined);
  });
}

if (!process.env.VITEST) {
  test('reviews source and output, pins evidence, and advances', async ({ page }, testInfo) => {
    await mockWorkspace(page);
    await page.goto('/');

    await expect(page).toHaveTitle(/Trace Review/);
    await expect(page.getByRole('heading', { name: 'Grey mouse / sodium bar' })).toBeVisible();
    await expect(page.getByText('Trace 1 of 5')).toBeVisible();
    await expect(page.getByText('evals/outputs')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Import set' })).toHaveCount(0);

    if (testInfo.project.name === 'mobile') {
      await expect(page.getByRole('tab', { name: 'Output' })).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('tab', { name: 'Source' }).click();
      await expect(page.getByLabel('Source image')).toBeVisible();
      await page.getByRole('tab', { name: 'Output' }).click();
    } else {
      await expect(page.getByLabel('Source image')).toBeVisible();
      await expect(page.getByLabel('Output image. Annotation pins can be placed here.')).toBeVisible();
    }

    for (const criterion of rubric) {
      await page.getByLabel(`${criterion.label} score`).getByRole('radio', { name: '4' }).click();
    }

    await page.getByRole('button', { name: 'Add annotation' }).click();
    await page.getByLabel('Output image. Annotation pins can be placed here.').click({ position: { x: 160, y: 160 } });
    await page.getByPlaceholder('Describe the visible evidence.').fill('The front paw reads too human.');
    await expect(page.getByRole('button', { name: /Annotation pin 1/ })).toBeVisible();

    await page.getByRole('button', { name: 'Save grade and next' }).click();
    await expect(page.getByText('Trace 2 of 5')).toBeVisible();

    const accessibilityScan = await new AxeBuilder({ page }).analyze();
    expect(accessibilityScan.violations.filter((violation) =>
      violation.impact === 'serious' || violation.impact === 'critical',
    )).toEqual([]);
  });
}
