export const EVAL_BUNDLE_SCHEMA_VERSION = 1 as const;

export type PromptStatus = 'recorded' | 'missing';
export type TraceStatus = 'ungraded' | 'draft' | 'graded';
export type Severity = 'low' | 'medium' | 'high';
export type AssetRole = 'source' | 'output';

export interface Asset {
  id: string;
  sha256: string;
  originalName: string;
  mediaType: 'image/png' | 'image/jpeg';
  byteSize: number;
  width: number;
  height: number;
  url: string;
  createdAt: string;
}

export interface RubricCriterion {
  id: string;
  label: string;
  passThreshold: number;
}

export interface RubricTemplate {
  schemaVersion: typeof EVAL_BUNDLE_SCHEMA_VERSION;
  id: string;
  name: string;
  criteria: RubricCriterion[];
}

export interface Annotation {
  id: string;
  traceId: string;
  assetRole: AssetRole;
  x: number;
  y: number;
  category: string;
  severity: Severity;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface Review {
  traceId: string;
  scores: Record<string, number>;
  completed: boolean;
  updatedAt: string;
  annotations: Annotation[];
}

export interface Trace {
  id: string;
  runId: string;
  ordinal: number;
  sourceAsset: Asset;
  outputAsset: Asset;
  target: string | null;
  notes: string[];
  sourceMetadata: Record<string, unknown> | null;
  status: TraceStatus;
  review: Review;
  createdAt: string;
}

export interface RunSummary {
  id: string;
  title: string;
  prompt: string | null;
  promptStatus: PromptStatus;
  characterId: string | null;
  styleId: string | null;
  target: string | null;
  producedBy: string | null;
  notes: string | null;
  traceCount: number;
  gradedCount: number;
  importWarnings: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RunDetail extends RunSummary {
  characterSnapshot: Record<string, unknown> | string | null;
  styleSnapshot: Record<string, unknown> | string | null;
  rubric: RubricCriterion[];
  traces: Trace[];
}

export type Run = RunDetail;

export interface ProfileOption {
  id: string;
  displayName: string;
  raw: string;
}

export interface BootstrapResponse {
  runs: RunSummary[];
  characters: ProfileOption[];
  styles: ProfileOption[];
}

export interface ReviewInput {
  scores: Record<string, number>;
  completed: boolean;
}

export interface AnnotationInput {
  assetRole: AssetRole;
  x: number;
  y: number;
  category: string;
  severity: Severity;
  note: string;
}

export interface EvalBundleV1 {
  schemaVersion: typeof EVAL_BUNDLE_SCHEMA_VERSION;
  exportedAt: string;
  run: Omit<RunDetail, 'traces'>;
  traces: Array<{
    trace: Omit<Trace, 'sourceAsset' | 'outputAsset' | 'review'>;
    source: Asset;
    output: Asset;
    review: Review;
  }>;
  checksums: Record<string, string>;
}
