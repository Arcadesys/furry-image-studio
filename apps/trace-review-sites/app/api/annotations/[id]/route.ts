import { deleteAnnotation, updateAnnotation } from "@/lib/trace-store";
import type { AnnotationInput } from "../../../../trace-review/shared/types";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    const input = await request.json() as AnnotationInput;
    return Response.json(await updateAnnotation(id, input));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Annotation could not be updated.";
    return Response.json(
      { error: message },
      { status: message === "ANNOTATION_NOT_FOUND" ? 404 : 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  try {
    return await deleteAnnotation(id)
      ? new Response(null, { status: 204 })
      : Response.json({ error: "ANNOTATION_NOT_FOUND" }, { status: 404 });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Annotation could not be deleted." },
      { status: 500 },
    );
  }
}
