import type { RubricCriterion } from '../shared/types.js';

export const DEFAULT_RUBRIC: RubricCriterion[] = [
  { id: 'target-selection', label: 'Target selection', passThreshold: 4 },
  { id: 'character-fidelity', label: 'Character fidelity', passThreshold: 4 },
  { id: 'background-preservation', label: 'Background preservation', passThreshold: 4 },
  { id: 'paws-anatomy', label: 'Paws / anatomy', passThreshold: 4 },
  { id: 'lighting-color', label: 'Lighting / color', passThreshold: 4 },
];

export const EVAL_OUTPUTS_DIR = 'evals/outputs';
export const MAX_OUTPUTS_PER_RUN = 8;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
