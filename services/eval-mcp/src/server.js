import express from "express";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

import { createClaimSchema, finalizeClaimSchema, getClaimSchema } from "./contracts.js";
import { TraceStore } from "./store.js";

function result(content, text) {
  return { structuredContent: content, content: [{ type: "text", text }] };
}

function toolError(error) {
  return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : "Eval trace service failed." }] };
}

function makeServer(store) {
  const server = new McpServer({ name: "furry-image-studio-eval", version: "0.1.0" });
  const mutationAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
  server.registerTool("create_eval_claim", {
    title: "Create external eval claim",
    description: "Use this when a rated generated image with visual references needs a checksum-backed external eval claim.",
    inputSchema: createClaimSchema.shape,
    annotations: mutationAnnotations,
  }, async (input) => {
    try {
      const created = await store.createClaim(input);
      return result({ claimId: created.claim.id, status: created.claim.status, result: created.existing ? "existing" : "created", uploads: created.uploads }, created.existing ? "External eval claim already exists." : "External eval claim created; upload each private artifact, then finalize it.");
    } catch (error) {
      return toolError(error);
    }
  });
  server.registerTool("finalize_eval_claim", {
    title: "Finalize external eval claim",
    description: "Use this after every private source and output artifact for an eval claim has been uploaded through its short-lived ingress grant.",
    inputSchema: finalizeClaimSchema.shape,
    annotations: mutationAnnotations,
  }, async (input) => {
    try {
      const claim = await store.finalizeClaim(input.ownerId, input.claimId);
      return result(claim, claim.result === "existing" ? "External eval claim already recorded." : `External eval claim recorded with ${claim.traceCount} trace${claim.traceCount === 1 ? "" : "s"}.`);
    } catch (error) {
      return toolError(error);
    }
  });
  server.registerTool("get_eval_claim", {
    title: "Get external eval claim",
    description: "Use this when checking the durable external status of one owner's eval trace claim.",
    inputSchema: getClaimSchema.shape,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, async (input) => {
    try {
      const claim = await store.getClaim(input.ownerId, input.claimId);
      return result(claim, `External eval claim is ${claim.status}.`);
    } catch (error) {
      return toolError(error);
    }
  });
  return server;
}

export async function createEvalMcpApp({ storageRoot = process.env.EVAL_TRACE_STORAGE_ROOT || path.join(tmpdir(), "furry-image-studio-eval-trace-private"), serviceToken = process.env.EVAL_TRACE_SERVICE_TOKEN } = {}) {
  if (!serviceToken || serviceToken.length < 24) throw new Error("EVAL_TRACE_SERVICE_TOKEN must be configured with at least 24 characters.");
  const store = new TraceStore(storageRoot);
  await store.initialize();
  const app = createMcpExpressApp();
  app.use(express.json({ limit: "1mb" }));
  app.get("/health", (_request, response) => response.json({ ok: true }));
  app.use((request, response, next) => {
    if (request.path === "/health") return next();
    if (request.get("authorization") !== `Bearer ${serviceToken}`) return response.status(401).json({ error: "Unauthorized eval trace service request." });
    return next();
  });
  app.put("/ingress/:token", express.raw({ type: "image/*", limit: "10mb" }), async (request, response) => {
    try {
      if (!Buffer.isBuffer(request.body)) return response.status(400).json({ error: "Image bytes are required." });
      response.status(201).json(await store.putArtifact(request.params.token, request.body, request.get("content-type")));
    } catch (error) {
      response.status(400).json({ error: error instanceof Error ? error.message : "Artifact upload failed." });
    }
  });
  app.post("/mcp", async (request, response) => {
    const server = makeServer(store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await server.connect(transport);
      await transport.handleRequest(request, response, request.body);
    } catch (error) {
      if (!response.headersSent) response.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal eval trace MCP error." }, id: null });
    } finally {
      response.once("close", () => { void transport.close(); void server.close(); });
    }
  });
  return { app, store };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { app } = await createEvalMcpApp();
  const port = Number(process.env.PORT || 3300);
  app.listen(port, () => console.log(`Furry Image Studio eval MCP listening on http://127.0.0.1:${port}/mcp`));
}
