import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const maxDuration = 300;

export const RODIN_MODEL_ID = "fal-ai/hyper3d/rodin";

const FAL_KEY = process.env.FAL_KEY ?? process.env.RODIN_API_KEY;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

export async function POST(request: NextRequest) {
  console.log("[refine-mesh] POST received at", new Date().toISOString());

  try {
    const body = await request.json();
    const { imageDataUrl } = body as { imageDataUrl?: string };

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "No imageDataUrl provided" },
        { status: 400 }
      );
    }

    if (!FAL_KEY) {
      console.log("[refine-mesh] MOCK MODE — no FAL_KEY set");
      return NextResponse.json({
        status: "COMPLETED",
        requestId: "mock-refine-request",
        glbUrl: null,
        mock: true,
        message:
          "Mock response — set FAL_KEY or RODIN_API_KEY in .env.local for real refinement",
      });
    }

    // Convert data URL to a File-like blob for fal.storage upload
    const matches = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: "Invalid image data URL format" },
        { status: 400 }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const buffer = Buffer.from(base64Data, "base64");

    // Upload to fal.storage
    let imageUrl: string;
    try {
      const blob = new Blob([buffer], { type: mimeType });
      const file = new File([blob], "input.png", { type: mimeType });
      imageUrl = await fal.storage.upload(file);
      console.log("[refine-mesh] fal.storage upload OK: %s", imageUrl);
    } catch (uploadErr) {
      console.error("[refine-mesh] fal.storage.upload FAILED:", uploadErr);
      // Fallback to base64 data URI for smaller images
      const sizeKB = buffer.byteLength / 1024;
      if (sizeKB > 4000) {
        return NextResponse.json(
          { error: "Image too large. Please use an image under 4MB." },
          { status: 413 }
        );
      }
      imageUrl = imageDataUrl;
      console.log("[refine-mesh] Using original data URI as fallback");
    }

    console.log("[refine-mesh] Submitting refinement job to %s...", RODIN_MODEL_ID);
    const queued = await fal.queue.submit(RODIN_MODEL_ID, {
      input: {
        input_image_urls: [imageUrl],
        geometry_file_format: "glb",
        quality: "high",
      },
    });

    console.log(
      "[refine-mesh] Job accepted. RequestId: %s Status: %s",
      queued.request_id,
      queued.status
    );
    return NextResponse.json({
      status: queued.status,
      requestId: queued.request_id,
      responseUrl: queued.response_url,
      statusUrl: queued.status_url,
    });
  } catch (error) {
    console.error(
      "[refine-mesh] UNHANDLED ERROR:",
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error
    );
    return NextResponse.json(
      {
        error: `Internal error: ${error instanceof Error ? error.message : "Unknown"}`,
      },
      { status: 500 }
    );
  }
}
