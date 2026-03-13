import { z } from "zod";

// ─── Material Definition ───────────────────────────────────────────────────────

export const MaterialDefSchema = z.object({
  color: z.string().optional().default("#888888"),
  roughness: z.number().min(0).max(1).optional().default(0.5),
  metalness: z.number().min(0).max(1).optional().default(0.0),
  opacity: z.number().min(0).max(1).optional().default(1.0),
  name: z.string().optional(),
});

export interface MaterialDef {
  color?: string;
  roughness?: number;
  metalness?: number;
  opacity?: number;
  name?: string;
}

// ─── Expression type: either a literal number or a parameter reference "$paramId" or expression "$width * 0.5"

const ExpressionSchema = z.union([z.number(), z.string()]);
export type Expression = z.infer<typeof ExpressionSchema>;

// ─── Repeat Config (for repeatable parts like drawers, shelves, slats) ─────────

export const RepeatConfigSchema = z.object({
  count: ExpressionSchema, // e.g. "$drawerCount" or 4
  axis: z.enum(["x", "y", "z"]),
  spacing: ExpressionSchema, // e.g. "$height / $drawerCount" or 0.2
  offset: ExpressionSchema.optional(), // starting offset
});

export type RepeatConfig = z.infer<typeof RepeatConfigSchema>;

// ─── Assembly Node (recursive) ─────────────────────────────────────────────────

export const AssemblyNodeSchema: z.ZodType<AssemblyNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    label: z.string().optional(),
    type: z.enum(["group", "primitive"]),

    // Primitive geometry (only when type === "primitive")
    primitive: z
      .enum(["box", "rounded_box", "cylinder", "sphere", "ellipsoid", "cone", "torus", "extrusion", "lathe", "capsule", "plane"])
      .optional(),
    // Dimensions keyed by primitive-specific names, values can be expressions
    // e.g. { width: "$width", height: "$height * 0.04", depth: "$depth" }
    // For cylinder: { radius: 0.02, height: "$legHeight" }
    dimensions: z.record(z.string(), ExpressionSchema).optional(),

    // Transform relative to parent
    position: z
      .tuple([ExpressionSchema, ExpressionSchema, ExpressionSchema])
      .optional(),
    rotation: z.tuple([z.number(), z.number(), z.number()]).optional(), // euler degrees

    // Material
    material: MaterialDefSchema.optional(),

    // Children (only when type === "group")
    children: z.array(z.lazy(() => AssemblyNodeSchema)).optional(),

    // Repeat configuration (stamps this node N times along an axis)
    repeat: RepeatConfigSchema.optional(),

    // CSG boolean operation (for group nodes)
    boolean_op: z.enum(["union", "subtract", "intersect"]).optional(),

    // Tags for the QA auditor and refiner
    tags: z.array(z.string()).optional(),
  })
);

export interface AssemblyNode {
  id: string;
  label?: string;
  type: "group" | "primitive";
  primitive?: "box" | "rounded_box" | "cylinder" | "sphere" | "ellipsoid" | "cone" | "torus" | "extrusion" | "lathe" | "capsule" | "plane";
  dimensions?: Record<string, Expression>;
  position?: [Expression, Expression, Expression];
  rotation?: [number, number, number];
  material?: MaterialDef;
  children?: AssemblyNode[];
  repeat?: RepeatConfig;
  boolean_op?: "union" | "subtract" | "intersect";
  tags?: string[];
}

// ─── Parameter (same as before but richer) ─────────────────────────────────────

export const ParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["continuous", "discrete"]).catch("continuous"),
  unit: z.string().optional(),
  min: z.number(),
  max: z.number(),
  default: z.number(),
  step: z.number().optional(),
  group: z.string().optional(),
});

export type Parameter = z.infer<typeof ParameterSchema>;

// ─── Constraint ────────────────────────────────────────────────────────────────

export const ConstraintSchema = z.object({
  id: z.string().optional(),
  rule: z.string(),
  errorMessage: z.string(),
  severity: z.enum(["error", "warning"]).optional().default("error"),
});

export type Constraint = z.infer<typeof ConstraintSchema>;

// ─── Assembly Schema (the PIR — Parametric Intermediate Representation) ────────

export const AssemblySchemaSchema = z.object({
  version: z.string().default("2.0"),
  productType: z.string(),
  parameters: z.array(ParameterSchema),
  assembly: AssemblyNodeSchema,
  constraints: z.array(ConstraintSchema).optional(),
});

export type AssemblySchema = z.infer<typeof AssemblySchemaSchema>;

// ─── Parametric Config (runtime parameter values) ──────────────────────────────

export type ParametricConfig = Record<string, number>;

// ─── Validation Result ─────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  violations: Array<{
    constraintId?: string;
    rule: string;
    message: string;
    severity: "error" | "warning";
  }>;
  nodeCount: number;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  };
}
