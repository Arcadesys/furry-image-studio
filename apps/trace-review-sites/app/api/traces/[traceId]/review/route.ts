import { saveReview } from "@/lib/trace-store";
import type { ReviewInput } from "../../../../../trace-review/shared/types";

export async function PUT(
  request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await context.params;
  try {
    const input = await request.json() as ReviewInput;
    return Response.json(await saveReview(traceId, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review could not be saved.";
    return Response.json(
      { error: message },
      { status: message === "TRACE_NOT_FOUND" ? 404 : 400 },
    );
  }
}
