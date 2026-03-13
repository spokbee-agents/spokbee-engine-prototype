import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";
import { RODIN_MODEL_ID } from "../route";

export const runtime = "nodejs";
export const maxDuration = 300;

const FAL_KEY = process.env.FAL_KEY ?? process.env.RODIN_API_KEY;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

function extractGlbUrl(data: Record<string, unknown>): string | undefined {
  return (
    (data.glb_url as string | undefined) ||
    (data.model_url as string | undefined) ||
    ((data.outputs as Record<string, unknown> | undefined)?.glb as string | undefined) ||
    ((data.model_mesh as Record<string, unknown> | undefined)?.url as string | undefined)
  );
}

export async function GET(request: NextRequest) {
  const requestId = request.nextUrl.searchParams.get("requestId");

  if (!requestId) {
    return NextResponse.json({ error: "Missing requestId" }, { status: 400 });
  }

  if (!FAL_KEY) {
    return NextResponse.json({
      status: "COMPLETED",
      requestId,
      glbUrl: null,
      mock: true,
      message:
        "Mock response — set FAL_KEY or RODIN_API_KEY in .env.local for real generation",
    });
  }

  try {
    const status = await fal.queue.status(RODIN_MODEL_ID, {
      requestId,
      logs: true,
    });

    if (status.status !== "COMPLETED") {
      return NextResponse.json({
        status: status.status,
        requestId,
      });
    }

    const result = await fal.queue.result(RODIN_MODEL_ID, { requestId });
    const data = result.data as Record<string, unknown>;
    const glbUrl = extractGlbUrl(data);

    if (!glbUrl) {
      console.error(
        "[generate-mesh/status] No GLB URL in response. Keys: %s. Full data: %s",
        Object.keys(data).join(", "),
        JSON.stringify(data).slice(0, 500)
      );
      return NextResponse.json(
        { error: "No GLB URL in fal response", requestId },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "COMPLETED",
      requestId: result.requestId,
      glbUrl,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Gateway Timeout" || error.message === "Request Timeout")
    ) {
      return NextResponse.json({
        status: "IN_PROGRESS",
        requestId,
        retryable: true,
      });
    }

    console.error(
      "[generate-mesh/status] UNHANDLED ERROR:",
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    );
    return NextResponse.json(
      {
        error: `Internal error: ${error instanceof Error ? error.message : "Unknown"}`,
        requestId,
      },
      { status: 500 }
    );
  }
}
