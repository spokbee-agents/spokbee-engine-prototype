import { z } from "zod";

export const ParameterSchema = z.object({
  id: z.string(),
  label: z.string(),
  type: z.enum(["continuous", "discrete"]),
  unit: z.string().optional(),
  min: z.number(),
  max: z.number(),
  default: z.number(),
  step: z.number().optional(),
});

export const SegmentSchema = z.object({
  id: z.string(),
  type: z.enum(["rigid", "stretchable", "repeatable"]),
  boundingBox: z.object({
    min: z.tuple([z.number(), z.number(), z.number()]),
    max: z.tuple([z.number(), z.number(), z.number()]),
  }),
  behavior: z.string().optional(),
  stretchAxis: z.enum(["x", "y", "z"]).optional(),
  repeatAxis: z.enum(["x", "y", "z"]).optional(),
  linkedTo: z.string(),
  spacing: z.string().optional(),
});

export const ConstraintSchema = z.object({
  rule: z.string(),
  errorMessage: z.string(),
});

export const ParametricManifestSchema = z.object({
  version: z.string(),
  productType: z.string(),
  baseAsset: z.string(),
  parameters: z.array(ParameterSchema),
  segments: z.array(SegmentSchema),
  constraints: z.array(ConstraintSchema).optional(),
  transformScript: z.string().optional(),
});

export type Parameter = z.infer<typeof ParameterSchema>;
export type Segment = z.infer<typeof SegmentSchema>;
export type ParametricManifest = z.infer<typeof ParametricManifestSchema>;
export type ParametricConfig = Record<string, number>;
