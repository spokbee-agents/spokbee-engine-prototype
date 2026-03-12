import { ParametricManifest } from "@/types/manifest";

export const MOCK_MANIFEST: ParametricManifest = {
  version: "1.0",
  productType: "cabinet",
  baseAsset: "base_mesh.glb",
  parameters: [
    {
      id: "height",
      label: "Cabinet Height",
      type: "continuous",
      unit: "inches",
      min: 40,
      max: 80,
      default: 60,
      step: 1,
    },
    {
      id: "width",
      label: "Cabinet Width",
      type: "continuous",
      unit: "inches",
      min: 20,
      max: 48,
      default: 30,
      step: 1,
    },
    {
      id: "depth",
      label: "Cabinet Depth",
      type: "continuous",
      unit: "inches",
      min: 12,
      max: 24,
      default: 18,
      step: 1,
    },
    {
      id: "drawerCount",
      label: "Number of Drawers",
      type: "discrete",
      min: 1,
      max: 6,
      default: 3,
    },
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
    {
      rule: "drawerCount * 8 <= height - 4",
      errorMessage: "Too many drawers for this height",
    },
  ],
};

// The transform function that applies parametric config to the procedural geometry
export function applyParametricTransform(
  config: Record<string, number>,
  manifest: ParametricManifest
): {
  heightScale: number;
  widthScale: number;
  depthScale: number;
  drawerCount: number;
} {
  const heightParam = manifest.parameters.find((p) => p.id === "height");
  const widthParam = manifest.parameters.find((p) => p.id === "width");
  const depthParam = manifest.parameters.find((p) => p.id === "depth");

  return {
    heightScale: (config.height ?? heightParam?.default ?? 60) / 60,
    widthScale: (config.width ?? widthParam?.default ?? 30) / 30,
    depthScale: (config.depth ?? depthParam?.default ?? 18) / 18,
    drawerCount: config.drawerCount ?? 3,
  };
}
