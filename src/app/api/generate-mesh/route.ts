import { NextRequest, NextResponse } from "next/server";
import { fal } from "@fal-ai/client";

// Configure fal client with API key from environment
const FAL_KEY = process.env.FAL_KEY;

if (FAL_KEY) {
  fal.config({ credentials: FAL_KEY });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    if (!FAL_KEY) {
      console.log("[MOCK] fal.ai Rodin API — returning demo GLB URL");
      await new Promise((r) => setTimeout(r, 2000));
      return NextResponse.json({
        status: "Done",
        glbUrl: "/mock/demo_cabinet.glb",
        mock: true,
        message: "Mock response — set FAL_KEY in .env.local for real generation",
      });
    }

    // Convert File to base64 data URI to bypass fal.storage.upload() issues in Vercel
    const arrayBuffer = await image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = image.type || "image/jpeg";
    const dataUri = `data:${mimeType};base64,${base64}`;
    console.log("Image converted to data URI (%s, %d bytes)", mimeType, arrayBuffer.byteLength);

    console.log("Calling fal-ai/rodin...");
    const result = await fal.subscribe("fal-ai/rodin", {
      input: {
        input_image_url: dataUri,
        mesh_mode: "Quad",
        quality: "high",
        material: "PBR",
        tier: "Regular",
      },
      logs: true,
    });

    console.log("Rodin Generation Complete.");

    const glbUrl =
      (result.data as Record<string, unknown>)?.glb_url ||
      (result.data as Record<string, unknown>)?.model_url ||
      ((result.data as Record<string, unknown>)?.outputs as Record<string, unknown>)?.glb;

    if (!glbUrl) {
      console.error("Unexpected fal response shape:", JSON.stringify(result.data));
      return NextResponse.json(
        { error: "No GLB URL in fal response" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      status: "Done",
      glbUrl,
      requestId: result.requestId,
    });
  } catch (error) {
    console.error("fal.ai Rodin API error:", error);
    return NextResponse.json(
      { error: `Internal error: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
