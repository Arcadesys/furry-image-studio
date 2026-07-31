import { z } from "zod";

export const contentHashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const artifactSchema = z.object({
  contentHash: contentHashSchema,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteSize: z.number().int().positive().max(10 * 1024 * 1024),
  width: z.number().int().positive().max(6000),
  height: z.number().int().positive().max(6000),
  label: z.string().trim().min(1).max(120).optional(),
});

export const createClaimSchema = z.object({
  ownerId: z.uuid(),
  idempotencyKey: z.string().uuid(),
  jobId: z.uuid(),
  feedbackId: z.uuid(),
  revision: z.number().int().positive(),
  supersedesClaimId: z.uuid().nullable().optional(),
  prompt: z.string().min(1).max(20_000),
  characterSnapshot: z.record(z.string(), z.unknown()),
  referenceSnapshot: z.array(z.record(z.string(), z.unknown())).min(1).max(8),
  providerSettings: z.record(z.string(), z.unknown()),
  feedback: z.object({
    rating: z.enum(["up", "down"]),
    note: z.string().max(1000),
  }),
  sources: z.array(artifactSchema).min(1).max(8),
  output: artifactSchema,
});

export const finalizeClaimSchema = z.object({
  ownerId: z.uuid(),
  claimId: z.uuid(),
});

export const getClaimSchema = z.object({
  ownerId: z.uuid(),
  claimId: z.uuid(),
});
