import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { AssemblySchemaSchema } from "@/types/assembly-schema";
import { MOCK_ASSEMBLY_SCHEMA } from "@/lib/mock-data";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `You are the Architect agent for the Spokbee 5.0 Universal Parametric Pipeline. Your role is to analyze a product image and output a recursive Assembly Schema (Parametric Intermediate Representation / PIR) that a procedural geometry engine can use to build an editable 3D model.

## Output Format
Output ONLY valid JSON matching the Assembly Schema format below. No markdown, no explanation.

{
  "version": "2.0",
  "productType": "<detected product type, e.g. cabinet, chair, table, shelf, lamp>",
  "parameters": [
    {
      "id": "<snake_case_id>",
      "label": "<Human Readable Label>",
      "type": "continuous" | "discrete",
      "unit": "<optional unit, e.g. inches, cm, mm>",
      "min": <number>,
      "max": <number>,
      "default": <number>,
      "step": <optional step size>,
      "group": "<optional UI group, e.g. Dimensions, Features, Style>"
    }
  ],
  "assembly": <AssemblyNode>,
  "constraints": [
    {
      "id": "<constraint_id>",
      "rule": "<expression that must be true, e.g. $drawerCount * 8 <= $height - 4>",
      "errorMessage": "<user-facing message>",
      "severity": "error" | "warning"
    }
  ]
}

## AssemblyNode Structure (recursive)
Each node is either a "group" (container) or a "primitive" (geometry):

{
  "id": "<unique_snake_case_id>",
  "label": "<Human Label>",
  "type": "group" | "primitive",

  // For primitives only:
  "primitive": "box" | "cylinder" | "sphere" | "cone" | "torus",
  "dimensions": {
    // For box: "width", "height", "depth"
    // For cylinder: "radius", "height", "radiusTop", "radiusBottom"
    // For sphere: "radius"
    // For cone: "radius", "height"
    // For torus: "radius", "tube"
    // Values can be numbers or expression strings referencing parameters:
    "<key>": <number> | "<expression string>"
  },

  // Transform (relative to parent):
  "position": [<x>, <y>, <z>],  // each can be a number or expression string
  "rotation": [<rx>, <ry>, <rz>],  // euler angles in degrees (numbers only)

  // Material:
  "material": {
    "color": "<hex color>",
    "roughness": <0-1>,
    "metalness": <0-1>,
    "opacity": <0-1>
  },

  // For groups only:
  "children": [<AssemblyNode>, ...],

  // Optional repeat (stamps this node N times along an axis):
  "repeat": {
    "count": <number or expression>,
    "axis": "x" | "y" | "z",
    "spacing": <number or expression>,
    "offset": <number or expression>
  },

  "tags": ["<optional>", "<classification>", "<tags>"]
}

## Expression Syntax
Expressions are strings that reference parameters with $ prefix and support arithmetic:
- Simple reference: "$width"
- Arithmetic: "$height * 0.5", "$width - 2", "$depth / $drawerCount"
- Parentheses: "($height - 4) / $drawerCount"
- Negation: "$width / -2", "-$depth / 2"
- Literal numbers mixed with references: "$width + 0.5"

## Guidelines
1. Identify the product type and break it into a hierarchical component tree.
2. The root node should be a group containing all major structural sub-assemblies.
3. Use groups to organize related parts (e.g., a "leg_assembly" group containing 4 leg primitives).
4. Use repeat for any parts that appear in a regular pattern (drawers, shelves, slats, legs, etc.).
5. Choose realistic default dimensions in inches or cm. Be conservative with parameter ranges.
6. All position values should be relative to the parent group's origin.
7. Use expressions to make dimensions and positions parametric — link everything back to the parameters.
8. Assign distinct materials with realistic colors for different part types (wood, metal, glass, fabric, etc.).
9. Add constraints that enforce physical feasibility (parts fitting, proportions, stability).
10. Tag nodes for classification: "structural", "decorative", "hardware", "repeatable", etc.
11. Think about how the model should look when parameters change — positions must update correctly.
12. The model's origin should be at the bottom-center so it sits on the ground plane.`;

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
      console.log("[generate-schema] MOCK — returning demo assembly schema");
      await new Promise((r) => setTimeout(r, 1500));

      return NextResponse.json({
        schema: MOCK_ASSEMBLY_SCHEMA,
        mock: true,
        message:
          "Mock response — set GEMINI_API_KEY in .env.local for real analysis",
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
                ? `The product is: ${productDescription}. Analyze this image and generate the Assembly Schema (PIR).`
                : "Analyze this product image and generate the Assembly Schema (PIR).",
            },
          ],
        },
      ],
    });

    const text = response.text ?? "";

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [
      null,
      text,
    ];
    const jsonStr = jsonMatch[1]?.trim() || text.trim();

    const parsed = JSON.parse(jsonStr);

    // Validate against Assembly Schema
    const validated = AssemblySchemaSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        "[generate-schema] Gemini output failed validation:",
        validated.error.issues
      );
      return NextResponse.json(
        {
          error: "Gemini output did not match Assembly Schema format",
          details: validated.error.issues,
          rawOutput: jsonStr.slice(0, 2000),
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ schema: validated.data });
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
