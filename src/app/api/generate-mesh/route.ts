import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

export const runtime = "nodejs";
export const RODIN_MODEL_ID = "fal-ai/hyper3d/rodin";
// Vercel Pro max is 300s; this prevents the serverless function from timing out
// while waiting for Rodin Gen-2 (which takes 60-90s typically)
export const maxDuration = 300;

// Configure fal client with API key from environment
const FAL_KEY = process.env.FAL_KEY ?? process.env.RODIN_API_KEY;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

export async function GET() {
  return NextResponse.json(
    {
      error: "Method not allowed",
      message:
        "Use POST with multipart/form-data and an `image` file field to submit a job, then poll /api/generate-mesh/status.",
    },
    { status: 405 }
  );
}

export async function POST(request: NextRequest) {
  console.log("[generate-mesh] POST received at", new Date().toISOString());

  try {
    console.log("[generate-mesh] Parsing formData...");
    const formData = await request.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      console.log("[generate-mesh] ERROR: No image in formData");
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    console.log(
      "[generate-mesh] Image received: name=%s type=%s size=%d bytes",
      image.name,
      image.type,
      image.size
    );

    const supportedMimeTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    const mimeType = image.type || "application/octet-stream";
    if (!supportedMimeTypes.has(mimeType)) {
      return NextResponse.json(
        {
          error:
            "Unsupported image type. Please upload a PNG, JPEG, or WebP image.",
        },
        { status: 400 }
      );
    }

    if (!FAL_KEY) {
      console.log("[generate-mesh] MOCK MODE — no FAL_KEY set");
      return NextResponse.json({
        status: "COMPLETED",
        requestId: "mock-request",
        glbUrl: null,
        mock: true,
        message:
          "Mock response — set FAL_KEY or RODIN_API_KEY in .env.local for real generation",
      });
    }

    // Upload image to fal.storage to get a URL, instead of inlining a massive
    // base64 data URI which can exceed payload limits and cause 500s
    console.log("[generate-mesh] Uploading image to fal.storage...");
    let imageUrl: string;
    try {
      imageUrl = await fal.storage.upload(image);
      console.log("[generate-mesh] fal.storage upload OK: %s", imageUrl);
    } catch (uploadErr) {
      console.error("[generate-mesh] fal.storage.upload FAILED:", uploadErr);
      // Fallback: try base64 data URI for smaller images
      const arrayBuffer = await image.arrayBuffer();
      const sizeKB = arrayBuffer.byteLength / 1024;
      console.log("[generate-mesh] Falling back to base64 data URI (%d KB)", sizeKB);
      if (sizeKB > 4000) {
        console.error("[generate-mesh] Image too large for base64 fallback (%d KB)", sizeKB);
        return NextResponse.json(
          { error: "Image too large. Please use an image under 4MB." },
          { status: 413 }
        );
      }
      const base64 = Buffer.from(arrayBuffer).toString("base64");
      imageUrl = `data:${mimeType};base64,${base64}`;
      console.log("[generate-mesh] base64 data URI created (%s)", mimeType);
    }

    console.log("[generate-mesh] Submitting job to %s...", RODIN_MODEL_ID);
    const queued = await fal.queue.submit(RODIN_MODEL_ID, {
      input: {
        input_image_urls: [imageUrl],
        geometry_file_format: "glb",
        quality: "high",
      },
    });

    console.log(
      "[generate-mesh] Job accepted. RequestId: %s Status: %s",
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
      "[generate-mesh] UNHANDLED ERROR:",
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    );
    return NextResponse.json(
      {
        error: `Internal error: ${error instanceof Error ? error.message : "Unknown"}`,
      },
      { status: 500 }
    );
  }
}
