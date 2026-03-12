import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

// Vercel Pro max is 300s; this prevents the serverless function from timing out
// while waiting for Rodin Gen-2 (which takes 60-90s typically)
export const maxDuration = 300;

// Configure fal client with API key from environment
const FAL_KEY = process.env.FAL_KEY;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
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

    if (!FAL_KEY) {
      console.log("[generate-mesh] MOCK MODE — no FAL_KEY set");
      await new Promise((r) => setTimeout(r, 2000));
      return NextResponse.json({
        status: "Done",
        glbUrl: "/mock/demo_cabinet.glb",
        mock: true,
        message: "Mock response — set FAL_KEY in .env.local for real generation",
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
      const mimeType = image.type || "image/jpeg";
      imageUrl = `data:${mimeType};base64,${base64}`;
      console.log("[generate-mesh] base64 data URI created (%s)", mimeType);
    }

    console.log("[generate-mesh] Calling fal-ai/rodin (subscribe)...");
    const result = await fal.subscribe("fal-ai/rodin", {
      input: {
        input_image_url: imageUrl,
        mesh_mode: "Quad",
        quality: "high",
        material: "PBR",
        tier: "Regular",
      },
      logs: true,
      onQueueUpdate: (update) => {
        console.log(
          "[generate-mesh] Queue status: %s (elapsed: %ds)",
          update.status,
          Math.round((Date.now() - startTime) / 1000)
        );
      },
    });

    console.log(
      "[generate-mesh] Rodin complete in %ds. RequestId: %s",
      Math.round((Date.now() - startTime) / 1000),
      result.requestId
    );

    const glbUrl =
      (result.data as Record<string, unknown>)?.glb_url ||
      (result.data as Record<string, unknown>)?.model_url ||
      ((result.data as Record<string, unknown>)?.outputs as Record<string, unknown>)?.glb;

    if (!glbUrl) {
      console.error(
        "[generate-mesh] No GLB URL in response. Keys: %s. Full data: %s",
        Object.keys(result.data as object).join(", "),
        JSON.stringify(result.data).slice(0, 500)
      );
      return NextResponse.json(
        { error: "No GLB URL in fal response" },
        { status: 500 }
      );
    }

    console.log("[generate-mesh] SUCCESS — glbUrl: %s", glbUrl);
    return NextResponse.json({
      status: "Done",
      glbUrl,
      requestId: result.requestId,
    });
  } catch (error) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.error(
      "[generate-mesh] UNHANDLED ERROR after %ds:",
      elapsed,
      error instanceof Error ? { message: error.message, stack: error.stack } : error
    );
    return NextResponse.json(
      {
        error: `Internal error: ${error instanceof Error ? error.message : "Unknown"}`,
        elapsed,
      },
      { status: 500 }
    );
  }
}
