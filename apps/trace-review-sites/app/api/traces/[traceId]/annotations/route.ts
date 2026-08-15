import { addAnnotation } from "@/lib/trace-store";
import type { AnnotationInput } from "../../../../../trace-review/shared/types";

export async function POST(
  request: Request,
  context: { params: Promise<{ traceId: string }> },
) {
  const { traceId } = await context.params;
  try {
    const input = await request.json() as AnnotationInput;
    return Response.json(await addAnnotation(traceId, input), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Annotation could not be saved.";
    return Response.json(
      { error: message },
      { status: message === "TRACE_NOT_FOUND" ? 404 : 400 },
    );
  }
}
