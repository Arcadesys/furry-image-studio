import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const MAX_INGRESS_AGE_MS = 10 * 60 * 1000;

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stableHash(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safePathSegment(value) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) throw new Error("Unsafe private storage key.");
  return value;
}

export class TraceStore {
  constructor(root) {
    this.root = root;
  }

  async initialize() {
    await Promise.all(["claims", "idempotency", "tokens"].map((directory) => mkdir(path.join(this.root, directory), { recursive: true, mode: 0o700 })));
  }

  claimPath(claimId) {
    return path.join(this.root, "claims", `${safePathSegment(claimId)}.json`);
  }

  async readClaim(claimId) {
    return JSON.parse(await readFile(this.claimPath(claimId), "utf8"));
  }

  async saveClaim(claim) {
    const target = this.claimPath(claim.id);
    const temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(claim, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, target);
  }

  async createClaim(input) {
    const idempotencyPath = path.join(this.root, "idempotency", `${stableHash({ ownerId: input.ownerId, idempotencyKey: input.idempotencyKey })}.json`);
    try {
      const existing = JSON.parse(await readFile(idempotencyPath, "utf8"));
      const claim = await this.readClaim(existing.claimId);
      if (claim.payloadHash !== stableHash(input)) throw new Error("Idempotency key was reused with different claim evidence.");
      return { claim, existing: true, uploads: [] };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }

    const id = randomUUID();
    const artifacts = [
      ...input.sources.map((manifest, index) => ({ kind: "source", index, manifest })),
      { kind: "output", index: 0, manifest: input.output },
    ].map((artifact) => ({ ...artifact, token: randomUUID(), uploaded: false }));
    const claim = {
      id,
      ownerId: input.ownerId,
      createdAt: new Date().toISOString(),
      status: "pending_upload",
      payloadHash: stableHash(input),
      input,
      artifacts,
      traceIds: [],
    };
    await this.saveClaim(claim);
    await writeFile(idempotencyPath, `${JSON.stringify({ claimId: id })}\n`, { mode: 0o600, flag: "wx" });
    return { claim, existing: false, uploads: artifacts.map((artifact) => ({ artifact: artifact.kind, index: artifact.index, token: artifact.token })) };
  }

  async putArtifact(token, bytes, contentType) {
    const tokenPath = path.join(this.root, "tokens", `${safePathSegment(token)}.json`);
    let location;
    try {
      location = JSON.parse(await readFile(tokenPath, "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") {
        for (const entry of await this.claimFiles()) {
          const claim = JSON.parse(await readFile(entry, "utf8"));
          const artifact = claim.artifacts.find((candidate) => candidate.token === token);
          if (artifact) {
            location = { claimId: claim.id, token };
            await writeFile(tokenPath, JSON.stringify(location), { mode: 0o600 });
            break;
          }
        }
      } else throw error;
    }
    if (!location) throw new Error("Unknown or expired artifact ingress token.");
    const claim = await this.readClaim(location.claimId);
    const artifact = claim.artifacts.find((candidate) => candidate.token === token);
    if (!artifact || Date.now() - Date.parse(claim.createdAt) > MAX_INGRESS_AGE_MS) throw new Error("Artifact ingress token has expired.");
    if (contentType?.split(";")[0] !== artifact.manifest.mimeType) throw new Error("Artifact content type does not match its claim manifest.");
    if (bytes.length !== artifact.manifest.byteSize || sha256(bytes) !== artifact.manifest.contentHash) throw new Error("Artifact bytes do not match the checksum-backed claim manifest.");
    const artifactPath = path.join(this.root, "claims", `${claim.id}-${artifact.kind}-${artifact.index}`);
    await writeFile(artifactPath, bytes, { mode: 0o600 });
    artifact.uploaded = true;
    await this.saveClaim(claim);
    return { claimId: claim.id, artifact: artifact.kind, index: artifact.index };
  }

  async finalizeClaim(ownerId, claimId) {
    const claim = await this.ownedClaim(ownerId, claimId);
    if (claim.status === "recorded") return this.publicClaim(claim, "existing");
    if (!claim.artifacts.every((artifact) => artifact.uploaded)) throw new Error("Every source and output artifact must be uploaded before finalizing the trace claim.");
    claim.status = "recorded";
    claim.recordedAt = new Date().toISOString();
    claim.traceIds = claim.artifacts.filter((artifact) => artifact.kind === "source").map((source) => randomUUID());
    await this.saveClaim(claim);
    return this.publicClaim(claim, "recorded");
  }

  async getClaim(ownerId, claimId) {
    return this.publicClaim(await this.ownedClaim(ownerId, claimId));
  }

  async ownedClaim(ownerId, claimId) {
    const claim = await this.readClaim(claimId);
    if (claim.ownerId !== ownerId) throw new Error("Eval claim not found.");
    return claim;
  }

  publicClaim(claim, result) {
    return { claimId: claim.id, status: claim.status, traceIds: claim.traceIds, traceCount: claim.traceIds.length, ...(result ? { result } : {}) };
  }

  async claimFiles() {
    const { readdir } = await import("node:fs/promises");
    return (await readdir(path.join(this.root, "claims"))).filter((name) => name.endsWith(".json")).map((name) => path.join(this.root, "claims", name));
  }
}
