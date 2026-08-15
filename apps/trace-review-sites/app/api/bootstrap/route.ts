import { getBootstrap } from "@/lib/trace-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getBootstrap());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Review workspace unavailable." },
      { status: 500 },
    );
  }
}
