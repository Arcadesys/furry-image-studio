import { z } from 'zod';
import { MAX_OUTPUTS_PER_RUN } from './constants.js';

export const canonicalAnnotationSchema = z.object({
  id: z.string().optional(),
  assetRole: z.enum(['source', 'output']),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  category: z.string().min(1),
  severity: z.enum(['low', 'medium', 'high']),
  note: z.string().min(1),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
}).passthrough();

export const canonicalReviewSchema = z.object({
  scores: z.record(z.string(), z.number().int().min(1).max(5)),
  completed: z.boolean(),
  updatedAt: z.string().optional(),
  annotations: z.array(canonicalAnnotationSchema).optional().default([]),
}).passthrough();

export const canonicalTraceSchema = z.object({
  id: z.string().min(1).optional(),
  source: z.string().min(1),
  output: z.string().min(1),
  target: z.string().nullable().optional(),
  notes: z.array(z.string()).optional().default([]),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  review: canonicalReviewSchema.optional(),
}).passthrough();

const profileSnapshotSchema = z.object({
  id: z.string().min(1),
  snapshot: z.unknown(),
}).passthrough();

export const rubricSchema = z.array(z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  passThreshold: z.number().int().min(1).max(5),
})).min(1);

export const canonicalImportSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1).optional(),
  title: z.string().min(1),
  prompt: z.string().nullable(),
  promptStatus: z.enum(['recorded', 'missing']),
  character: profileSnapshotSchema.nullable(),
  style: profileSnapshotSchema.nullable(),
  target: z.string().nullable(),
  producedBy: z.string().nullable(),
  notes: z.string().nullable(),
  traces: z.array(canonicalTraceSchema).min(1).max(MAX_OUTPUTS_PER_RUN),
  rubric: rubricSchema.optional(),
  exportedAt: z.string().optional(),
  checksums: z.record(z.string(), z.string()).optional(),
}).passthrough().superRefine((manifest, context) => {
  if (manifest.promptStatus === 'missing' && manifest.prompt !== null) {
    context.addIssue({
      code: 'custom',
      path: ['prompt'],
      message: 'prompt must be null when promptStatus is missing',
    });
  }
  if (manifest.promptStatus === 'recorded' && manifest.prompt === null) {
    context.addIssue({
      code: 'custom',
      path: ['prompt'],
      message: 'prompt is required when promptStatus is recorded',
    });
  }
});

export const legacyOutputSchema = z.object({
  source: z.string().min(1),
  output: z.string().min(1),
  target: z.string().nullable().optional(),
  notes: z.array(z.string()).optional().default([]),
}).passthrough();

export const legacyManifestSchema = z.object({
  description: z.string().nullable().optional(),
  character: z.record(z.string(), z.unknown()).nullable().optional(),
  style: z.string().nullable().optional(),
  outputs: z.array(legacyOutputSchema).min(1).max(MAX_OUTPUTS_PER_RUN),
}).passthrough();

export type CanonicalImportManifest = z.infer<typeof canonicalImportSchema>;
export type CanonicalReview = z.infer<typeof canonicalReviewSchema>;

export interface CanonicalExportTrace {
  source: string;
  output: string;
  target: string | null;
  notes: string[];
  metadata: Record<string, unknown> | null;
  review: {
    scores: Record<string, number>;
    completed: boolean;
    updatedAt: string;
    annotations: Array<{
      assetRole: 'source' | 'output';
      x: number;
      y: number;
      category: string;
      severity: 'low' | 'medium' | 'high';
      note: string;
      createdAt: string;
      updatedAt: string;
    }>;
  };
}

export interface CanonicalEvalBundleV1 {
  schemaVersion: 1;
  title: string;
  prompt: string | null;
  promptStatus: 'recorded' | 'missing';
  character: { id: string; snapshot: Record<string, unknown> | string | null } | null;
  style: { id: string; snapshot: Record<string, unknown> | string | null } | null;
  target: string | null;
  producedBy: string | null;
  notes: string | null;
  rubric: Array<{ id: string; label: string; passThreshold: number }>;
  traces: CanonicalExportTrace[];
  exportedAt: string;
  checksums: Record<string, string>;
}

export function manifestReferencedPaths(rawManifest: unknown): string[] {
  const canonical = canonicalImportSchema.safeParse(rawManifest);
  if (canonical.success) {
    return [...new Set([
      ...canonical.data.traces.flatMap((trace) => [trace.source, trace.output]),
      ...Object.keys(canonical.data.checksums ?? {}),
    ])];
  }
  const legacy = legacyManifestSchema.parse(rawManifest);
  return [...new Set(legacy.outputs.flatMap((trace) => [trace.source, trace.output]))];
}
