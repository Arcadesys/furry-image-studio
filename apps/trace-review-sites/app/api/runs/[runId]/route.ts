import { getRun } from "@/lib/trace-store";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const { runId } = await context.params;
  try {
    const run = await getRun(runId);
    return run
      ? Response.json(run)
      : Response.json({ error: "RUN_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Review set unavailable." },
      { status: 500 },
    );
  }
}
