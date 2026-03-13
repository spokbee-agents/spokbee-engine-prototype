import { AssemblySchema, ParametricConfig } from "@/types/assembly-schema";

export const MOCK_ASSEMBLY_SCHEMA: AssemblySchema = {
  version: "2.0",
  productType: "cabinet",
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
      group: "Dimensions",
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
      group: "Dimensions",
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
      group: "Dimensions",
    },
    {
      id: "drawerCount",
      label: "Number of Drawers",
      type: "discrete",
      min: 1,
      max: 6,
      default: 3,
      group: "Features",
    },
  ],
  assembly: {
    id: "root",
    label: "Cabinet",
    type: "group",
    children: [
      {
        id: "back-panel",
        label: "Back Panel",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: "$width",
          height: "$height",
          depth: "0.04",
        },
        position: [0, "$height * 0.5", "$depth * -0.5 + 0.02"],
        material: { color: "#8B7355", roughness: 0.7, metalness: 0.05 },
        tags: ["structural"],
      },
      {
        id: "left-panel",
        label: "Left Panel",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: "0.04",
          height: "$height",
          depth: "$depth",
        },
        position: ["$width * -0.5 + 0.02", "$height * 0.5", 0],
        material: { color: "#8B7355", roughness: 0.7, metalness: 0.05 },
        tags: ["structural"],
      },
      {
        id: "right-panel",
        label: "Right Panel",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: "0.04",
          height: "$height",
          depth: "$depth",
        },
        position: ["$width * 0.5 - 0.02", "$height * 0.5", 0],
        material: { color: "#8B7355", roughness: 0.7, metalness: 0.05 },
        tags: ["structural"],
      },
      {
        id: "top-panel",
        label: "Top Panel",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: "$width + 0.02",
          height: "0.04",
          depth: "$depth + 0.02",
        },
        position: [0, "$height - 0.02", 0],
        material: { color: "#8B7355", roughness: 0.7, metalness: 0.05 },
        tags: ["structural"],
      },
      {
        id: "bottom-panel",
        label: "Bottom Panel",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: "$width",
          height: "0.04",
          depth: "$depth",
        },
        position: [0, "0.02", 0],
        material: { color: "#8B7355", roughness: 0.7, metalness: 0.05 },
        tags: ["structural"],
      },
      {
        id: "drawer",
        label: "Drawer",
        type: "group",
        repeat: {
          count: "$drawerCount",
          axis: "y",
          spacing: "$height / $drawerCount",
          offset: "0.04",
        },
        children: [
          {
            id: "drawer-face",
            label: "Drawer Face",
            type: "primitive",
            primitive: "box",
            dimensions: {
              width: "$width - 0.1",
              height: "$height / $drawerCount - 0.04",
              depth: "0.04",
            },
            position: [0, 0, "$depth * 0.5 - 0.02"],
            material: { color: "#A0926B", roughness: 0.6, metalness: 0.05 },
            tags: ["drawer"],
          },
          {
            id: "drawer-handle",
            label: "Handle",
            type: "primitive",
            primitive: "box",
            dimensions: {
              width: "$width * 0.3",
              height: "0.02",
              depth: "0.02",
            },
            position: [0, 0, "$depth * 0.5 + 0.01"],
            material: { color: "#C0C0C0", roughness: 0.3, metalness: 0.8 },
            tags: ["hardware"],
          },
        ],
        tags: ["repeatable"],
      },
    ],
  },
  constraints: [
    {
      id: "drawer-fit",
      rule: "$drawerCount * 8 <= $height - 4",
      errorMessage: "Too many drawers for this height",
      severity: "error",
    },
  ],
};

/**
 * Build a default ParametricConfig from an AssemblySchema's parameter definitions.
 */
export function getDefaultConfig(schema: AssemblySchema): ParametricConfig {
  const config: ParametricConfig = {};
  for (const param of schema.parameters) {
    config[param.id] = param.default;
  }
  return config;
}
