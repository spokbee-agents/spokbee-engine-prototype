import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import { AssemblySchemaSchema } from "@/types/assembly-schema";
import { MOCK_ASSEMBLY_SCHEMA } from "@/lib/mock-data";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// ─── LLM Output Normalization ─────────────────────────────────────────────────
// Gemini may produce slightly non-conformant JSON. This normalizer fixes common
// issues so our strict Zod schema can parse it.

const KNOWN_PRIMITIVES = new Set([
  "box", "rounded_box", "cylinder", "sphere", "ellipsoid", "cone", "torus", "extrusion", "lathe", "capsule", "plane",
]);

const PRIMITIVE_ALIASES: Record<string, string> = {
  cuboid: "box", cube: "box", rect: "box", rectangle: "box",
  rounded_box: "rounded_box", roundedbox: "rounded_box", beveled_box: "rounded_box",
  cyl: "cylinder", tube: "cylinder", pipe: "cylinder",
  ball: "sphere", orb: "sphere",
  oval: "ellipsoid", egg: "ellipsoid", hemisphere: "ellipsoid",
  donut: "torus", ring: "torus",
  wheel: "lathe", disc: "lathe", disk: "lathe",
  pill: "capsule",
  flat: "plane", surface: "plane", quad: "plane",
};

/* eslint-disable @typescript-eslint/no-explicit-any */
function normalizeNode(node: any, validParamIds?: Set<string>): any {
  if (!node || typeof node !== "object") return node;

  // Ensure required fields
  if (!node.id) node.id = `node_${Math.random().toString(36).slice(2, 8)}`;
  if (!node.type) {
    node.type = node.primitive || node.children ? (node.primitive ? "primitive" : "group") : "group";
  }

  // Normalize primitive names
  if (node.primitive && typeof node.primitive === "string") {
    const lower = node.primitive.toLowerCase();
    if (PRIMITIVE_ALIASES[lower]) {
      node.primitive = PRIMITIVE_ALIASES[lower];
    } else if (!KNOWN_PRIMITIVES.has(lower)) {
      node.primitive = "box"; // fallback unknown primitives to box
    } else {
      node.primitive = lower;
    }
  }

  // Normalize position: ensure it's a 3-tuple
  if (node.position) {
    if (Array.isArray(node.position)) {
      while (node.position.length < 3) node.position.push(0);
      node.position = node.position.slice(0, 3);
    } else {
      delete node.position;
    }
  }

  // Normalize rotation: ensure it's a 3-tuple of numbers
  if (node.rotation) {
    if (Array.isArray(node.rotation)) {
      node.rotation = node.rotation.slice(0, 3).map((v: any) =>
        typeof v === "number" ? v : 0
      );
      while (node.rotation.length < 3) node.rotation.push(0);
    } else {
      delete node.rotation;
    }
  }

  // Normalize material — material fields must be literal values, not expressions
  if (node.material && typeof node.material === "object") {
    // Color must be a hex string, not an expression reference
    if (typeof node.material.color === "string" && node.material.color.startsWith("$")) {
      node.material.color = "#888888";
    }
    // Numeric material props: coerce strings, strip $references
    for (const key of ["roughness", "metalness", "opacity"] as const) {
      const val = node.material[key];
      if (typeof val === "string") {
        if (val.startsWith("$")) {
          // Can't reference a parameter here — use default
          node.material[key] = key === "opacity" ? 1.0 : 0.5;
        } else {
          node.material[key] = parseFloat(val) || (key === "opacity" ? 1.0 : 0.5);
        }
      }
    }
  }

  // Normalize repeat
  if (node.repeat && typeof node.repeat === "object") {
    if (node.repeat.axis && typeof node.repeat.axis === "string") {
      node.repeat.axis = node.repeat.axis.toLowerCase();
      if (!["x", "y", "z"].includes(node.repeat.axis)) {
        node.repeat.axis = "y";
      }
    }
  }

  // Strip $references to invalid/dropped parameters from expressions
  if (validParamIds) {
    const cleanExpr = (val: any): any => {
      if (typeof val !== "string") return val;
      // Check if any $reference points to a dropped param
      const refs = val.match(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g);
      if (refs) {
        for (const ref of refs) {
          const paramId = ref.slice(1);
          if (!validParamIds.has(paramId)) {
            // Replace unknown $reference with 1 (safe default)
            return val.replace(new RegExp(`\\$${paramId}`, "g"), "1");
          }
        }
      }
      return val;
    };

    // Clean dimensions
    if (node.dimensions && typeof node.dimensions === "object") {
      for (const key of Object.keys(node.dimensions)) {
        node.dimensions[key] = cleanExpr(node.dimensions[key]);
      }
    }
    // Clean position
    if (Array.isArray(node.position)) {
      node.position = node.position.map(cleanExpr);
    }
    // Clean repeat expressions
    if (node.repeat && typeof node.repeat === "object") {
      if (node.repeat.count) node.repeat.count = cleanExpr(node.repeat.count);
      if (node.repeat.spacing) node.repeat.spacing = cleanExpr(node.repeat.spacing);
      if (node.repeat.offset) node.repeat.offset = cleanExpr(node.repeat.offset);
    }
  }

  // Normalize children recursively
  if (Array.isArray(node.children)) {
    node.children = node.children.map((c: any) => normalizeNode(c, validParamIds));
  }

  // Normalize tags to string array
  if (node.tags && !Array.isArray(node.tags)) {
    node.tags = [String(node.tags)];
  }

  return node;
}

function normalizeGeminiOutput(raw: any): any {
  if (!raw || typeof raw !== "object") return raw;

  const output = { ...raw };

  // Force version to "2.0"
  output.version = "2.0";

  // Normalize parameters — strip non-numeric params (colors, text, etc.)
  if (Array.isArray(output.parameters)) {
    output.parameters = output.parameters
      .map((p: any) => {
        if (!p || typeof p !== "object") return null;
        const param = { ...p };

        // Coerce numeric strings
        if (typeof param.min === "string") param.min = parseFloat(param.min);
        if (typeof param.max === "string") param.max = parseFloat(param.max);
        if (typeof param.default === "string") param.default = parseFloat(param.default);
        if (typeof param.step === "string") param.step = parseFloat(param.step);

        // Drop parameters that aren't numeric (e.g. color pickers, text values)
        if (
          typeof param.default !== "number" || isNaN(param.default) ||
          typeof param.min !== "number" || isNaN(param.min) ||
          typeof param.max !== "number" || isNaN(param.max)
        ) {
          console.log(`[generate-schema] Dropping non-numeric parameter: ${param.id}`);
          return null;
        }

        // Ensure min <= default <= max
        if (param.default < param.min) param.default = param.min;
        if (param.default > param.max) param.default = param.max;

        // Default type if missing
        if (!param.type || (param.type !== "continuous" && param.type !== "discrete")) {
          param.type = Number.isInteger(param.default) && Number.isInteger(param.min) && Number.isInteger(param.max) ? "discrete" : "continuous";
        }

        return param;
      })
      .filter((p: any) => p !== null);
  }

  // Build set of valid parameter IDs for reference checking
  const validParamIds = new Set<string>(
    (output.parameters || []).map((p: any) => String(p.id))
  );

  // Normalize assembly tree (pass valid param IDs for expression cleanup)
  if (output.assembly) {
    output.assembly = normalizeNode(output.assembly, validParamIds);
  }

  // Normalize constraints
  if (Array.isArray(output.constraints)) {
    output.constraints = output.constraints.map((c: any) => {
      if (!c || typeof c !== "object") return c;
      const constraint = { ...c };
      if (!constraint.errorMessage && constraint.message) {
        constraint.errorMessage = constraint.message;
        delete constraint.message;
      }
      if (!constraint.errorMessage && constraint.error_message) {
        constraint.errorMessage = constraint.error_message;
        delete constraint.error_message;
      }
      if (!constraint.errorMessage) {
        constraint.errorMessage = `Constraint violation: ${constraint.rule || "unknown"}`;
      }
      if (!constraint.severity) constraint.severity = "error";
      return constraint;
    });
  }

  return output;
}
/**
 * Lenient parse: recursively strip invalid nodes from the assembly tree
 * so that partial Gemini output can still render something useful.
 */
function stripInvalidNodes(node: any): any {
  if (!node || typeof node !== "object") return null;
  if (!node.id || !node.type) return null;

  if (node.children && Array.isArray(node.children)) {
    node.children = node.children
      .map(stripInvalidNodes)
      .filter((c: any) => c !== null);
    if (node.children.length === 0 && node.type === "group" && !node.primitive) {
      delete node.children;
    }
  }
  return node;
}

function attemptLenientParse(data: any): any | null {
  const copy = JSON.parse(JSON.stringify(data));

  // Ensure minimum structure
  if (!copy.parameters || !Array.isArray(copy.parameters)) return null;
  if (!copy.assembly) return null;

  copy.version = "2.0";

  // Build valid param set and strip invalid nodes from assembly tree
  const paramIds = new Set<string>((copy.parameters || []).map((p: any) => String(p.id)));
  copy.assembly = stripInvalidNodes(normalizeNode(copy.assembly, paramIds));
  if (!copy.assembly) return null;

  // Remove constraints if they're causing issues
  if (copy.constraints && !Array.isArray(copy.constraints)) {
    delete copy.constraints;
  }

  // Try validation again
  const result = AssemblySchemaSchema.safeParse(copy);
  if (result.success) return result.data;
  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const SYSTEM_PROMPT = `You are the Architect agent for the Spokbee 4.0 Universal Parametric Pipeline. Your role is to analyze a product image and output a HIGH-DETAIL recursive Assembly Schema (Parametric Intermediate Representation / PIR) that a procedural geometry engine can use to build a visually accurate, recognizable 3D model.

CRITICAL: Your output quality directly determines the visual fidelity of the 3D model. A lazy, low-node-count schema will produce a blocky, unrecognizable toy. A detailed 50-200+ node schema with proper CSG boolean operations, varied primitives, and realistic materials will produce a high-quality 3D representation that actually looks like the product. NEVER produce fewer than 40 nodes for any real product. Every visible surface, panel, trim piece, handle, button, light, vent, and detail must be its own node.

## Output Format
Output ONLY valid JSON matching the Assembly Schema format below. No markdown, no explanation.

{
  "version": "2.0",
  "productType": "<detected product type>",
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
  "primitive": "box" | "rounded_box" | "cylinder" | "sphere" | "cone" | "torus" | "extrusion" | "lathe" | "capsule",
  "dimensions": {
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

  // CSG boolean operation (groups only). The first child is the base shape,
  // subsequent children are the tool shapes:
  "boolean_op": "subtract" | "union" | "intersect",

  // Optional repeat (stamps this node N times along an axis):
  "repeat": {
    "count": <number or expression>,
    "axis": "x" | "y" | "z",
    "spacing": <number or expression>,
    "offset": <number or expression>
  },

  "tags": ["<optional>", "<classification>", "<tags>"]
}

## Primitive Reference

### box
Dimensions: width, height, depth.
Use for: flat panels, simple blocks, window panes, screens.

### rounded_box (PREFER THIS over plain box for most surfaces)
Dimensions: width, height, depth, radius (bevel radius, default ~5% of smallest dimension).
Use for: body panels, furniture surfaces, device housings, doors, hoods, fenders — anything that should look smooth and manufactured rather than sharp-edged.

### cylinder
Dimensions: radius, height, radiusTop (optional), radiusBottom (optional).
Use for: posts, pillars, exhaust pipes, buttons, ports, axles.

### sphere
Dimensions: radius.
Use for: headlights, knobs, dome lights, ball joints, decorative finials.

### ellipsoid (ESSENTIAL for organic/curved shapes — bowls, domes, eggs, body contours)
Dimensions: radiusX, radiusY, radiusZ (independent radii on each axis).
Use for: spoon bowls, domes, egg shapes, organic body contours, headlamp housings, rounded caps, seat cushions, mouse bodies, avocado halves. This is your go-to primitive for any shape that is round but NOT a perfect sphere.
Examples:
  - Spoon bowl: radiusX=2, radiusY=0.5, radiusZ=1.5 (wide, shallow, slightly narrower front-to-back)
  - Egg: radiusX=1, radiusY=1.4, radiusZ=1 (taller than wide)
  - Mouse body: radiusX=3, radiusY=1, radiusZ=2 (flat, wide, long)

### cone
Dimensions: radius, height.
Use for: nozzles, tapered legs, roof peaks, funnels.

### torus
Dimensions: radius, tube.
Use for: gaskets, ring handles, bezels, decorative rings.

### extrusion
Dimensions: width, height, depth.
Use for: frames, trim strips, edge banding, rails, molding, structural profiles.

### lathe (rotational solid — ESSENTIAL for wheels, knobs, turned parts)
Dimensions: radius, thickness, segments.
Use for: wheels, tires, pulleys, knobs, turned wooden legs, round handles, spools.

### capsule (pill / rounded cylinder)
Dimensions: radius, length.
Use for: handles, grab bars, rails, pipes, rounded supports, antenna, rods, spoon handles, fork tines.

### plane (flat surface)
Dimensions: width, height.
Use for: thin panels, screens, labels, decals, name plates, flat decorative surfaces. Renders as a single-sided flat rectangle.

## CSG Boolean Operations
A group node with "boolean_op" performs constructive solid geometry. The first child is the BASE shape, and all subsequent children are TOOL shapes that modify it.

### "subtract" — Cut holes and openings
Use to cut: windows from body panels, wheel wells from fenders, screen openings from device housings, vent slots, keyholes, screw holes, USB ports.

Example — door with window cutout:
{
  "id": "door_with_window",
  "type": "group",
  "boolean_op": "subtract",
  "children": [
    { "id": "door_panel", "type": "primitive", "primitive": "rounded_box", "dimensions": { "width": 36, "height": 20, "depth": 1.5, "radius": 0.3 }, "material": { "color": "#CC0000", "roughness": 0.3, "metalness": 0.4, "opacity": 1.0 } },
    { "id": "window_cutout", "type": "primitive", "primitive": "box", "dimensions": { "width": 28, "height": 12, "depth": 2 }, "position": [0, 3, 0] }
  ]
}

### "union" — Merge shapes seamlessly
Use to: combine curved panels into smooth body sections, merge structural members.

### "intersect" — Keep only the overlap
Use to: create complex curved shapes from intersecting volumes, trim to curved surfaces.

## Material Guide — Be Realistic
- Painted metal (car body, appliance): roughness 0.25-0.4, metalness 0.3-0.5
- Chrome / polished metal (trim, bumpers, handles): roughness 0.05-0.15, metalness 0.9-1.0
- Brushed metal (appliance panels): roughness 0.3-0.5, metalness 0.7-0.9
- Glass (windows, screens): roughness 0.05, metalness 0.1, opacity 0.3-0.5, color "#88CCFF" or "#AADDFF"
- Rubber (tires, gaskets, grips): roughness 0.85-0.95, metalness 0.0, color "#1A1A1A" or "#2A2A2A"
- Wood (furniture, panels): roughness 0.6-0.8, metalness 0.0
- Plastic (matte): roughness 0.5-0.7, metalness 0.0-0.1
- Plastic (glossy): roughness 0.15-0.3, metalness 0.05-0.15
- Fabric / upholstery: roughness 0.8-0.95, metalness 0.0
- Leather: roughness 0.5-0.7, metalness 0.0

## Structural Hierarchy — DEEP NESTING REQUIRED

Organize the assembly into logical sub-assemblies. Here is the expected depth for a vehicle:

root (group)
├── body (group)
│   ├── main_body_with_wells (group, boolean_op: "subtract")
│   │   ├── main_body (rounded_box — the full body shell)
│   │   ├── wheel_well_fl (cylinder — front-left cutout)
│   │   ├── wheel_well_fr (cylinder)
│   │   ├── wheel_well_rl (cylinder)
│   │   └── wheel_well_rr (cylinder)
│   ├── hood (rounded_box, angled via rotation)
│   ├── roof (rounded_box)
│   ├── trunk (rounded_box)
│   └── undercarriage (box)
├── cab (group)
│   ├── cab_with_windows (group, boolean_op: "subtract")
│   │   ├── cab_shell (rounded_box)
│   │   ├── windshield_opening (box)
│   │   ├── rear_window_opening (box)
│   │   ├── side_window_left_opening (box)
│   │   └── side_window_right_opening (box)
│   ├── windshield_glass (box — glass material)
│   ├── rear_window_glass (box — glass material)
│   ├── side_window_left_glass (box — glass material)
│   └── side_window_right_glass (box — glass material)
├── doors (group)
│   ├── door_left (group)
│   │   ├── door_panel_left (rounded_box)
│   │   ├── door_handle_left (capsule — chrome)
│   │   └── door_trim_left (extrusion)
│   └── door_right (group) ...
├── wheels (group)
│   ├── wheel_assembly_fl (group)
│   │   ├── tire_fl (lathe — rubber material)
│   │   ├── rim_fl (lathe — chrome material)
│   │   └── hub_fl (cylinder — chrome)
│   ├── wheel_assembly_fr (group) ...
│   ├── wheel_assembly_rl (group) ...
│   └── wheel_assembly_rr (group) ...
├── front_details (group)
│   ├── bumper_front (rounded_box — chrome or painted)
│   ├── headlight_left (sphere or cylinder — glass-like)
│   ├── headlight_right (sphere or cylinder)
│   ├── grille (group)
│   │   ├── grille_frame (extrusion — chrome)
│   │   └── grille_slats (capsule with repeat — chrome)
│   ├── fog_light_left (cylinder)
│   └── fog_light_right (cylinder)
├── rear_details (group)
│   ├── bumper_rear (rounded_box)
│   ├── taillight_left (rounded_box — red material)
│   ├── taillight_right (rounded_box — red material)
│   ├── exhaust_pipe_left (cylinder — dark chrome)
│   └── license_plate (box)
└── accessories (group)
    ├── mirror_left (group: arm capsule + head rounded_box)
    ├── mirror_right (group)
    ├── antenna (capsule — thin, tall)
    └── roof_rails (capsule with repeat, if applicable)

For furniture, apply the same principle: individual panels, edge banding (extrusion), legs (cylinder or capsule), drawer fronts (rounded_box), drawer pulls (capsule or cylinder, chrome), shelf pins (small cylinders), back panel, etc.

For electronics: housing top and bottom (rounded_box), screen area (boolean_op subtract for bezel), buttons (cylinder), ports (group of small cylinders/boxes subtracted from housing), speaker grille (group of small cylinders), LED indicators (sphere), stand/base, cable management, vents (boolean_op subtract rows of thin boxes).

## Organic / Curved Object Guide — CRITICAL FOR NON-BOXY OBJECTS

For organic shapes (cutlery, bottles, vases, shoes, organic forms), DO NOT use box or torus. Use ellipsoid and CSG:

### Spoon Example (FOLLOW THIS PATTERN):
{
  "id": "spoon",
  "type": "group",
  "children": [
    {
      "id": "bowl_hollow",
      "type": "group",
      "boolean_op": "subtract",
      "position": ["$total_length / 2 - $bowl_length / 2", "$bowl_depth * 0.3", 0],
      "children": [
        { "id": "bowl_outer", "type": "primitive", "primitive": "ellipsoid", "dimensions": { "radiusX": "$bowl_width / 2", "radiusY": "$bowl_depth", "radiusZ": "$bowl_length / 2" }, "material": { "color": "#C0C0C0", "roughness": 0.15, "metalness": 0.9 } },
        { "id": "bowl_inner", "type": "primitive", "primitive": "ellipsoid", "dimensions": { "radiusX": "$bowl_width / 2 - 0.1", "radiusY": "$bowl_depth - 0.08", "radiusZ": "$bowl_length / 2 - 0.1" }, "position": [0, 0.1, 0] }
      ]
    },
    {
      "id": "handle",
      "type": "primitive",
      "primitive": "capsule",
      "dimensions": { "radius": "$handle_width / 2", "length": "$total_length - $bowl_length" },
      "position": ["-$bowl_length / 2", 0, 0],
      "rotation": [0, 0, 90],
      "material": { "color": "#C0C0C0", "roughness": 0.15, "metalness": 0.9 }
    }
  ]
}

### Bottle Example:
Use cylinder for the body, cone or cylinder (with radiusTop < radiusBottom) for the neck taper, sphere or ellipsoid for the shoulder curve, cylinder for the cap.

### Cup/Mug:
Use cylinder for outer wall, CSG subtract a slightly smaller cylinder for the hollow interior. Capsule bent into a "C" or use torus for the handle.

### Shoe:
Use ellipsoid for the toe box, rounded_box for the sole, ellipsoid for the heel counter, group them with union CSG.

KEY RULES FOR ORGANIC OBJECTS:
1. NEVER use "torus" for bowls, cups, or concave shapes. Torus is a DONUT — it has a HOLE.
2. Use "ellipsoid" for any rounded surface that isn't a perfect sphere.
3. Use CSG "subtract" to hollow out shapes (bowl, cup, vase = outer ellipsoid minus inner ellipsoid).
4. Use "capsule" for handles, stems, arms, rods — anything long and rounded.
5. Position parts so they connect seamlessly — no floating disconnected pieces.
6. Think about how parts overlap and join. The handle meets the bowl at a specific point.

## Expression Syntax
Expressions are strings that reference parameters with $ prefix and support arithmetic:
- Simple reference: "$width"
- Arithmetic: "$height * 0.5", "$width - 2", "$depth / $drawerCount"
- Parentheses: "($height - 4) / $drawerCount"
- Negation: "$width / -2", "-$depth / 2"
- Literal numbers mixed with references: "$width + 0.5"

## Quality Checklist — FOLLOW THIS
1. Count your nodes. If you have fewer than 15, you are being too lazy. Add more detail.
2. Are you using rounded_box for body panels and surfaces? Plain box should be rare.
3. Are you using ellipsoid for any rounded/organic/curved surface? NEVER use torus for bowls or cups.
4. Are wheels modeled as lathe primitives with separate tire (rubber) and rim (chrome) parts?
5. Are windows modeled as boolean subtractions from the body, with separate glass panes placed inside?
6. Are handles, rails, and pipes using capsule primitives?
7. Are trim pieces and frames using extrusion primitives?
8. Does every node have a realistic material with appropriate roughness, metalness, and opacity?
9. Is the hierarchy at least 2-3 levels deep with logical sub-assemblies?
10. Are you using expressions to link dimensions and positions to parameters so the model is truly parametric?
11. The model's origin should be at the bottom-center so it sits on the ground plane.
12. Use repeat for any parts that appear in a regular pattern (drawer pulls, grille slats, vent slots, shelf pins, wheel bolts).
13. Are ALL parts properly positioned so they CONNECT to each other? No floating disconnected pieces!
14. For hollow objects (bowls, cups, vases), are you using CSG subtract with an outer and inner shape?
15. Tag nodes for classification: "structural", "decorative", "hardware", "repeatable", "glass", "trim", etc.`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { imageDataUrl, productDescription } = body;

    if (!imageDataUrl && !productDescription) {
      return NextResponse.json(
        { error: "Provide an image or a text description" },
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

    // Build message parts depending on input mode
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: any[] = [{ text: SYSTEM_PROMPT }];

    if (imageDataUrl) {
      const matches = imageDataUrl.match(/^data:(.+);base64,(.+)$/);
      if (!matches) {
        return NextResponse.json(
          { error: "Invalid image data URL format" },
          { status: 400 }
        );
      }
      parts.push({
        inlineData: { mimeType: matches[1], data: matches[2] },
      });
    }

    if (imageDataUrl && productDescription) {
      parts.push({
        text: `The product is: ${productDescription}. Analyze this image and generate the Assembly Schema (PIR).`,
      });
    } else if (imageDataUrl) {
      parts.push({
        text: "Analyze this product image and generate the Assembly Schema (PIR).",
      });
    } else {
      parts.push({
        text: `Generate the Assembly Schema (PIR) for: ${productDescription}. There is no image — use your knowledge to design a detailed, realistic parametric 3D model of this product.`,
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-image-preview",
      config: {
        maxOutputTokens: 65536,
        temperature: 0.2,
        responseMimeType: "application/json",
      },
      contents: [{ role: "user", parts }],
    });

    const text = response.text ?? "";

    console.log("[generate-schema] Gemini response length:", text.length);
    console.log("[generate-schema] Gemini response starts with:", text.slice(0, 200));
    console.log("[generate-schema] Gemini response ends with:", text.slice(-200));

    let parsed: Record<string, unknown> | null = null;

    // Strategy 1: direct parse (works when responseMimeType is honoured)
    try {
      parsed = JSON.parse(text);
    } catch {
      // continue to fallback strategies
    }

    // Strategy 2: extract from markdown code block
    if (!parsed) {
      const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch?.[1]) {
        try {
          parsed = JSON.parse(codeBlockMatch[1].trim());
        } catch {
          // continue
        }
      }
    }

    // Strategy 3: find outermost { ... } braces
    if (!parsed) {
      const braceStart = text.indexOf("{");
      const braceEnd = text.lastIndexOf("}");
      if (braceStart !== -1 && braceEnd > braceStart) {
        try {
          parsed = JSON.parse(text.slice(braceStart, braceEnd + 1));
        } catch {
          // continue
        }
      }
    }

    // Strategy 4: repair truncated JSON (Gemini hit token limit)
    // Find the outermost { and attempt to close unclosed braces/brackets
    if (!parsed) {
      const braceStart = text.indexOf("{");
      if (braceStart !== -1) {
        let jsonStr = text.slice(braceStart);
        // Strip trailing garbage after any content
        jsonStr = jsonStr.replace(/[,\s]+$/, "");
        // Count unclosed braces/brackets and close them
        let braces = 0, brackets = 0;
        let inString = false, escape = false;
        for (const ch of jsonStr) {
          if (escape) { escape = false; continue; }
          if (ch === "\\") { escape = true; continue; }
          if (ch === '"') { inString = !inString; continue; }
          if (inString) continue;
          if (ch === "{") braces++;
          else if (ch === "}") braces--;
          else if (ch === "[") brackets++;
          else if (ch === "]") brackets--;
        }
        // Close any unclosed strings
        if (inString) jsonStr += '"';
        // Close unclosed brackets then braces
        for (let i = 0; i < brackets; i++) jsonStr += "]";
        for (let i = 0; i < braces; i++) jsonStr += "}";

        try {
          parsed = JSON.parse(jsonStr);
          console.log("[generate-schema] Repaired truncated JSON successfully");
        } catch {
          // Last resort: try stripping the last partial value
          const lastComma = jsonStr.lastIndexOf(",");
          if (lastComma > 0) {
            let trimmed = jsonStr.slice(0, lastComma);
            // Re-count and close
            braces = 0; brackets = 0; inString = false; escape = false;
            for (const ch of trimmed) {
              if (escape) { escape = false; continue; }
              if (ch === "\\") { escape = true; continue; }
              if (ch === '"') { inString = !inString; continue; }
              if (inString) continue;
              if (ch === "{") braces++;
              else if (ch === "}") braces--;
              else if (ch === "[") brackets++;
              else if (ch === "]") brackets--;
            }
            if (inString) trimmed += '"';
            for (let i = 0; i < brackets; i++) trimmed += "]";
            for (let i = 0; i < braces; i++) trimmed += "}";
            try {
              parsed = JSON.parse(trimmed);
              console.log("[generate-schema] Repaired truncated JSON (trimmed last value)");
            } catch {
              // give up
            }
          }
        }
      }
    }

    if (!parsed) {
      console.error("[generate-schema] All JSON parse strategies failed. Raw text:", text.slice(0, 3000));
      return NextResponse.json(
        {
          error: "Gemini did not return valid JSON",
          rawOutput: text.slice(0, 3000),
        },
        { status: 422 }
      );
    }

    // Normalize common LLM output issues before validation
    const normalized = normalizeGeminiOutput(parsed);

    console.log(
      "[generate-schema] Normalized output keys:",
      JSON.stringify(Object.keys(normalized))
    );
    console.log(
      "[generate-schema] Has assembly?", !!normalized.assembly,
      "Has parameters?", !!normalized.parameters,
      "Parameter count:", Array.isArray(normalized.parameters) ? normalized.parameters.length : 0
    );

    // Validate against Assembly Schema
    const validated = AssemblySchemaSchema.safeParse(normalized);
    if (!validated.success) {
      const issues = validated.error.issues;
      console.error(
        "[generate-schema] Validation failed. Issues:",
        JSON.stringify(issues.slice(0, 10), null, 2)
      );
      console.error(
        "[generate-schema] Raw response (first 2000 chars):",
        text.slice(0, 2000)
      );

      // Try to return the schema anyway with minimal fixes, falling back gracefully
      // If the only issues are in deep nodes, the top-level structure may be usable
      console.log("[generate-schema] Attempting lenient parse...");
      try {
        const lenient = attemptLenientParse(normalized);
        if (lenient) {
          console.log("[generate-schema] Lenient parse succeeded");
          return NextResponse.json({ schema: lenient, lenient: true });
        }
      } catch (e) {
        console.error("[generate-schema] Lenient parse also failed:", e);
      }

      return NextResponse.json(
        {
          error: "Gemini output did not match Assembly Schema format",
          details: issues.slice(0, 5),
          rawOutput: text.slice(0, 3000),
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
