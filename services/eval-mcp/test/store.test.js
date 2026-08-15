import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { TraceStore } from "../src/store.js";

const hash = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const manifest = (bytes) => ({ contentHash: hash(bytes), mimeType: "image/png", byteSize: bytes.length, width: 1, height: 1 });
const uuid = () => randomUUID();
function input(overrides = {}) {
  const source = Buffer.from("source");
  const output = Buffer.from("output");
  return { ownerId: uuid(), idempotencyKey: uuid(), jobId: uuid(), feedbackId: uuid(), revision: 1, prompt: "exact prompt", characterSnapshot: { name: "Testy Taupin" }, referenceSnapshot: [{ contentHash: hash(source) }], providerSettings: { model: "gpt-image-1-mini" }, feedback: { rating: "up", note: "Keep the character profile" }, sources: [manifest(source)], output: manifest(output), _source: source, _output: output, ...overrides };
}

test("records a checksum-backed bundle and is idempotent", async () => {
  const store = new TraceStore(await mkdtemp(path.join(tmpdir(), "eval-store-")));
  await store.initialize();
  const values = input();
  const { _source, _output, ...claimInput } = values;
  const created = await store.createClaim(claimInput);
  assert.equal(created.uploads.length, 2);
  for (const upload of created.uploads) await store.putArtifact(upload.token, upload.artifact === "source" ? _source : _output, "image/png");
  const recorded = await store.finalizeClaim(claimInput.ownerId, created.claim.id);
  assert.equal(recorded.result, "recorded");
  assert.equal(recorded.traceCount, 1);
  const repeated = await store.createClaim(claimInput);
  assert.equal(repeated.existing, true);
  assert.equal((await store.finalizeClaim(claimInput.ownerId, created.claim.id)).result, "existing");
});

test("rejects checksum mismatch and hides claims from another owner", async () => {
  const store = new TraceStore(await mkdtemp(path.join(tmpdir(), "eval-store-")));
  await store.initialize();
  const values = input();
  const { _source, _output, ...claimInput } = values;
  const created = await store.createClaim(claimInput);
  await assert.rejects(() => store.putArtifact(created.uploads[0].token, Buffer.from("wrong"), "image/png"));
  await assert.rejects(() => store.getClaim(uuid(), created.claim.id), /not found/);
  await store.putArtifact(created.uploads[0].token, _source, "image/png");
  await store.putArtifact(created.uploads[1].token, _output, "image/png");
  await assert.doesNotReject(() => store.finalizeClaim(claimInput.ownerId, created.claim.id));
});
