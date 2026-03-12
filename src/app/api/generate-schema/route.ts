import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are a parametric 3D product analyzer for the Spokbee 4.0 engine.

Given an image of a product (furniture, fixture, etc.), analyze its structure and generate a Parametric Manifest that describes:
1. The configurable parameters (dimensions, counts, material options)
2. The geometric segments of the mesh and how they relate to parameters
3. A Three.js transformation script that can modify the mesh based on parameter values

Output ONLY valid JSON matching this schema:
{
  "version": "1.0",
  "productType": "<detected product type>",
  "baseAsset": "base_mesh.glb",
  "parameters": [
    {
      "id": "<param_id>",
      "label": "<Human Label>",
      "type": "continuous" | "discrete",
      "unit": "<optional unit>",
      "min": <number>,
      "max": <number>,
      "default": <number>,
      "step": <optional step>
    }
  ],
  "segments": [
    {
      "id": "<segment_id>",
      "type": "rigid" | "stretchable" | "repeatable",
      "boundingBox": {
        "min": [x, y, z],
        "max": [x, y, z]
      },
      "stretchAxis": "x" | "y" | "z",
      "linkedTo": "<param_id>",
      "behavior": "<optional behavior>"
    }
  ],
  "constraints": [
    {
      "rule": "<constraint expression>",
      "errorMessage": "<error message>"
    }
  ],
  "transformScript": "<Three.js code as a string that exports applyParametricConfig(scene, config, manifest)>"
}

Focus on identifying practical, realistic parameters that a manufacturer would want to configure. Be conservative with ranges.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageDataUrl, productDescription } = body;

    if (!imageDataUrl) {
      return NextResponse.json(
        { error: "No image data provided" },
        { status: 400 }
      );
    }

    // If no API key, return mock response
    if (!GEMINI_API_KEY) {
      console.log("[MOCK] Gemini API — returning demo manifest");
      await new Promise((r) => setTimeout(r, 1500));

      return NextResponse.json({
        manifest: {
          version: "1.0",
          productType: "cabinet",
          baseAsset: "base_mesh.glb",
          parameters: [
            { id: "height", label: "Height", type: "continuous", unit: "inches", min: 40, max: 80, default: 60, step: 1 },
            { id: "width", label: "Width", type: "continuous", unit: "inches", min: 20, max: 48, default: 30, step: 1 },
            { id: "depth", label: "Depth", type: "continuous", unit: "inches", min: 12, max: 24, default: 18, step: 1 },
            { id: "drawerCount", label: "Drawers", type: "discrete", min: 1, max: 6, default: 3 },
          ],
          segments: [
            {
              id: "body",
              type: "stretchable",
              boundingBox: { min: [-1, 0, -1], max: [1, 2, 1] },
              stretchAxis: "y",
              linkedTo: "height",
            },
          ],
          constraints: [
            { rule: "drawerCount * 8 <= height - 4", errorMessage: "Too many drawers for this height" },
          ],
        },
        mock: true,
        message: "Mock response — set GEMINI_API_KEY in .env.local for real analysis",
      });
    }

    // Real Gemini API call
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Extract base64 data and mime type from data URL
    const matches = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (!matches) {
      return NextResponse.json(
        { error: "Invalid image data URL format" },
        { status: 400 }
      );
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [
        {
          role: "user",
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: productDescription
                ? `The product is: ${productDescription}. Analyze this image and generate the parametric manifest.`
                : "Analyze this product image and generate the parametric manifest.",
            },
          ],
        },
      ],
    });

    const text = response.text ?? "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
    const jsonStr = jsonMatch[1]?.trim() || text.trim();

    const manifest = JSON.parse(jsonStr);

    return NextResponse.json({ manifest });
  } catch (error) {
    console.error("Gemini API error:", error);
    return NextResponse.json(
      {
        error: `Schema generation failed: ${error instanceof Error ? error.message : "Unknown"}`,
      },
      { status: 500 }
    );
  }
}
