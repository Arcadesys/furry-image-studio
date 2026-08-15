import { strToU8, zipSync } from "fflate";
import { getRun } from "@/lib/trace-store";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "trace-review";
}

function extension(mediaType: string): string {
  return mediaType === "image/jpeg" ? ".jpg" : ".png";
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fetchAsset(request: Request, assetUrl: string): Promise<Uint8Array> {
  const response = await fetch(new URL(assetUrl, request.url));
  if (!response.ok) throw new Error(`Could not include evidence asset ${assetUrl}.`);
  return new Uint8Array(await response.arrayBuffer());
}

export async function POST(
  request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  try {
    const run = await getRun(runId);
    if (!run) return Response.json({ error: "RUN_NOT_FOUND" }, { status: 404 });

    const exportedAt = new Date().toISOString();
    const files: Record<string, Uint8Array> = {
      "prompt.txt": strToU8(`${run.prompt ?? "UNKNOWN: prompt was not recorded by the source pipeline."}\n`),
      "profiles/character.json": strToU8(`${JSON.stringify({
        id: run.characterId,
        snapshot: run.characterSnapshot,
      }, null, 2)}\n`),
      "profiles/style.json": strToU8(`${JSON.stringify({
        id: run.styleId,
        snapshot: run.styleSnapshot,
      }, null, 2)}\n`),
      "rubric.json": strToU8(`${JSON.stringify(run.rubric, null, 2)}\n`),
      "reviews.json": strToU8(`${JSON.stringify(
        run.traces.map((trace) => trace.review),
        null,
        2,
      )}\n`),
    };

    const traces = [];
    for (const trace of run.traces) {
      const ordinal = String(trace.ordinal).padStart(2, "0");
      const sourcePath = `inputs/${ordinal}-source${extension(trace.sourceAsset.mediaType)}`;
      const outputPath = `outputs/${ordinal}-output${extension(trace.outputAsset.mediaType)}`;
      const [sourceBytes, outputBytes] = await Promise.all([
        fetchAsset(request, trace.sourceAsset.url),
        fetchAsset(request, trace.outputAsset.url),
      ]);
      files[sourcePath] = sourceBytes;
      files[outputPath] = outputBytes;
      traces.push({
        source: sourcePath,
        output: outputPath,
        target: trace.target,
        notes: trace.notes,
        metadata: trace.sourceMetadata,
        review: {
          scores: trace.review.scores,
          completed: trace.review.completed,
          updatedAt: trace.review.updatedAt,
          annotations: trace.review.annotations.map((annotation) => ({
            assetRole: annotation.assetRole,
            x: annotation.x,
            y: annotation.y,
            category: annotation.category,
            severity: annotation.severity,
            note: annotation.note,
            createdAt: annotation.createdAt,
            updatedAt: annotation.updatedAt,
          })),
        },
      });
    }

    const checksums: Record<string, string> = {};
    for (const [path, bytes] of Object.entries(files)) {
      checksums[path] = await digest(bytes);
    }
    const manifest = {
      schemaVersion: 1,
      title: run.title,
      prompt: run.prompt,
      promptStatus: run.promptStatus,
      character: run.characterId
        ? { id: run.characterId, snapshot: run.characterSnapshot }
        : null,
      style: run.styleId ? { id: run.styleId, snapshot: run.styleSnapshot } : null,
      target: run.target,
      producedBy: run.producedBy,
      notes: run.notes,
      rubric: run.rubric,
      traces,
      exportedAt,
      checksums,
    };
    files["manifest.json"] = strToU8(`${JSON.stringify(manifest, null, 2)}\n`);

    const fileName = `${slugify(run.title)}-${exportedAt.replace(/[:.]/g, "-")}.zip`;
    const archive = zipSync(files, { level: 0 });
    return new Response(archive.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Type": "application/zip",
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Regression bundle could not be exported." },
      { status: 500 },
    );
  }
}
