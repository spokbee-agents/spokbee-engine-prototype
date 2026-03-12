import { NextRequest, NextResponse } from "next/server";

// Hyper3D Rodin Gen-2 API integration
// Docs: https://hyper3d.ai/docs

const RODIN_API_KEY = process.env.RODIN_API_KEY;
const RODIN_BASE_URL = "https://hyperhuman.deemos.com/api/v2";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const image = formData.get("image") as File | null;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // If no API key, return mock response for demo
    if (!RODIN_API_KEY) {
      console.log("[MOCK] Rodin API — returning demo GLB URL");
      // Simulate processing delay
      await new Promise((r) => setTimeout(r, 2000));
      return NextResponse.json({
        status: "Done",
        glbUrl: "/mock/demo_cabinet.glb",
        mock: true,
        message: "Mock response — set RODIN_API_KEY in .env.local for real generation",
      });
    }

    // Step 1: Submit generation task
    const rodinFormData = new FormData();
    rodinFormData.append("images", image, image.name);
    rodinFormData.append("mesh_mode", "Quad");
    rodinFormData.append("quality", "high");
    rodinFormData.append("material", "PBR");
    rodinFormData.append("tier", "Regular");

    const submitRes = await fetch(`${RODIN_BASE_URL}/submit`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RODIN_API_KEY}`,
      },
      body: rodinFormData,
    });

    if (!submitRes.ok) {
      const err = await submitRes.text();
      return NextResponse.json(
        { error: `Rodin submit failed: ${err}` },
        { status: submitRes.status }
      );
    }

    const submitData = await submitRes.json();
    const taskUuid = submitData.uuid;

    if (!taskUuid) {
      return NextResponse.json(
        { error: "No task UUID returned from Rodin" },
        { status: 500 }
      );
    }

    // Step 2: Poll for completion
    let status = "Processing";
    let attempts = 0;
    const maxAttempts = 60; // 5 minutes max

    while (status !== "Done" && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 5000));
      attempts++;

      const statusRes = await fetch(`${RODIN_BASE_URL}/status`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${RODIN_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ uuid: taskUuid }),
      });

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();
      status = statusData.status;

      if (status === "Failed") {
        return NextResponse.json(
          { error: "Rodin mesh generation failed" },
          { status: 500 }
        );
      }
    }

    if (status !== "Done") {
      return NextResponse.json(
        { error: "Rodin generation timed out" },
        { status: 504 }
      );
    }

    // Step 3: Download the GLB
    const downloadRes = await fetch(`${RODIN_BASE_URL}/download`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RODIN_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uuid: taskUuid }),
    });

    if (!downloadRes.ok) {
      return NextResponse.json(
        { error: "Failed to download GLB from Rodin" },
        { status: 500 }
      );
    }

    const downloadData = await downloadRes.json();

    return NextResponse.json({
      status: "Done",
      glbUrl: downloadData.list?.[0]?.url || downloadData.url,
      taskUuid,
    });
  } catch (error) {
    console.error("Rodin API error:", error);
    return NextResponse.json(
      { error: `Internal error: ${error instanceof Error ? error.message : "Unknown"}` },
      { status: 500 }
    );
  }
}
