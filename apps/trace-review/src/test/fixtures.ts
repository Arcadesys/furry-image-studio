import type {
  BootstrapResponse,
  RunDetail,
  Trace,
} from '../../shared/types';

const NOW = '2026-07-28T15:42:00.000Z';
const sourceImage = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#3b2514"/><circle cx="250" cy="230" r="110" fill="#f2b38b"/><rect x="170" y="340" width="300" height="220" fill="#20272f"/></svg>',
);
const outputImage = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#3b2514"/><circle cx="250" cy="230" r="120" fill="#9aa0a5"/><circle cx="150" cy="125" r="70" fill="#d9a2a7"/><circle cx="350" cy="125" r="70" fill="#d9a2a7"/><rect x="170" y="340" width="300" height="220" fill="#20272f"/></svg>',
);

function createTrace(ordinal: number): Trace {
  const traceId = `00000000-0000-4000-8000-00000000000${ordinal}`;
  return {
    id: traceId,
    runId: '00000000-0000-4000-8000-000000000010',
    ordinal,
    sourceAsset: {
      id: `source-${ordinal}`,
      sha256: `source-sha-${ordinal}`,
      originalName: 'source.png',
      mediaType: 'image/png',
      byteSize: 100,
      width: 800,
      height: 600,
      url: sourceImage,
      createdAt: NOW,
    },
    outputAsset: {
      id: `output-${ordinal}`,
      sha256: `output-sha-${ordinal}`,
      originalName: `output-${ordinal}.png`,
      mediaType: 'image/png',
      byteSize: 100,
      width: 800,
      height: 600,
      url: outputImage,
      createdAt: NOW,
    },
    target: 'Front-left subject',
    notes: [],
    sourceMetadata: null,
    status: ordinal < 3 ? 'graded' : 'ungraded',
    review: {
      traceId,
      scores: ordinal < 3
        ? {
            'target-selection': 4,
            'character-fidelity': 4,
            'background-preservation': 5,
            'paws-anatomy': 3,
            'lighting-color': 4,
          }
        : {},
      completed: ordinal < 3,
      updatedAt: NOW,
      annotations: [],
    },
    createdAt: NOW,
  };
}

export const runFixture: RunDetail = {
  id: '00000000-0000-4000-8000-000000000010',
  title: 'Grey mouse / sodium bar',
  prompt: 'Transform only the front-left subject into a cartoony grey-furred mouse. Preserve everyone else and the real background.',
  promptStatus: 'recorded',
  characterId: 'grey-mouse',
  styleId: 'toon-in-real-world',
  target: 'Front-left subject',
  producedBy: 'External pipeline',
  notes: 'Crowd and white-balance evaluation',
  traceCount: 5,
  gradedCount: 2,
  importWarnings: [],
  createdAt: NOW,
  updatedAt: NOW,
  characterSnapshot: { species: 'anthropomorphic mouse' },
  styleSnapshot: 'Toon in real world',
  rubric: [
    { id: 'target-selection', label: 'Target selection', passThreshold: 4 },
    { id: 'character-fidelity', label: 'Character fidelity', passThreshold: 4 },
    { id: 'background-preservation', label: 'Background preservation', passThreshold: 4 },
    { id: 'paws-anatomy', label: 'Paws and anatomy', passThreshold: 4 },
    { id: 'lighting-color', label: 'Lighting and color', passThreshold: 4 },
  ],
  traces: Array.from({ length: 5 }, (_, index) => createTrace(index + 1)),
};

export const bootstrapFixture: BootstrapResponse = {
  runs: [{
    id: runFixture.id,
    title: runFixture.title,
    prompt: runFixture.prompt,
    promptStatus: runFixture.promptStatus,
    characterId: runFixture.characterId,
    styleId: runFixture.styleId,
    target: runFixture.target,
    producedBy: runFixture.producedBy,
    notes: runFixture.notes,
    traceCount: runFixture.traceCount,
    gradedCount: runFixture.gradedCount,
    importWarnings: runFixture.importWarnings,
    createdAt: runFixture.createdAt,
    updatedAt: runFixture.updatedAt,
  }],
  characters: [{ id: 'grey-mouse', displayName: 'Grey mouse', raw: 'species: mouse' }],
  styles: [{ id: 'toon-in-real-world', displayName: 'Toon in real world', raw: 'style: toon' }],
};
