import { AssemblySchema, ParametricConfig } from "@/types/assembly-schema";

// Material palette
const walnut = { color: "#5C4033", roughness: 0.65, metalness: 0.0 };
const walnutLight = { color: "#6B4F3A", roughness: 0.6, metalness: 0.0 };
const walnutDark = { color: "#3E2A1E", roughness: 0.7, metalness: 0.0 };
const brushedNickel = { color: "#C8C8CA", roughness: 0.25, metalness: 0.85 };
const backingBoard = { color: "#4A3A2A", roughness: 0.8, metalness: 0.0 };

const PANEL_THICKNESS = 0.75; // ¾ inch plywood
const BACK_THICKNESS = 0.25;
const DRAWER_GAP = 0.15; // gap between drawer faces
const TOEKICK_HEIGHT = 4;
const TOEKICK_INSET = 2;

export const MOCK_ASSEMBLY_SCHEMA: AssemblySchema = {
  version: "2.0",
  productType: "cabinet",
  parameters: [
    {
      id: "height",
      label: "Cabinet Height",
      type: "continuous",
      unit: "in",
      min: 30,
      max: 72,
      default: 48,
      step: 0.5,
      group: "Dimensions",
    },
    {
      id: "width",
      label: "Cabinet Width",
      type: "continuous",
      unit: "in",
      min: 18,
      max: 42,
      default: 28,
      step: 0.5,
      group: "Dimensions",
    },
    {
      id: "depth",
      label: "Cabinet Depth",
      type: "continuous",
      unit: "in",
      min: 12,
      max: 22,
      default: 16,
      step: 0.5,
      group: "Dimensions",
    },
    {
      id: "drawerCount",
      label: "Drawers",
      type: "discrete",
      min: 2,
      max: 6,
      default: 4,
      group: "Features",
    },
  ],
  assembly: {
    id: "cabinet",
    label: "Cabinet",
    type: "group",
    children: [
      // ── Carcass ──────────────────────────────────────────────────────
      {
        id: "left_side",
        label: "Left Side Panel",
        type: "primitive",
        primitive: "rounded_box",
        dimensions: {
          width: `${PANEL_THICKNESS}`,
          height: `$height - ${TOEKICK_HEIGHT}`,
          depth: "$depth",
          radius: "0.15",
        },
        position: [
          `$width * -0.5 + ${PANEL_THICKNESS * 0.5}`,
          `($height - ${TOEKICK_HEIGHT}) * 0.5 + ${TOEKICK_HEIGHT}`,
          0,
        ],
        material: walnut,
        tags: ["structural"],
      },
      {
        id: "right_side",
        label: "Right Side Panel",
        type: "primitive",
        primitive: "rounded_box",
        dimensions: {
          width: `${PANEL_THICKNESS}`,
          height: `$height - ${TOEKICK_HEIGHT}`,
          depth: "$depth",
          radius: "0.15",
        },
        position: [
          `$width * 0.5 - ${PANEL_THICKNESS * 0.5}`,
          `($height - ${TOEKICK_HEIGHT}) * 0.5 + ${TOEKICK_HEIGHT}`,
          0,
        ],
        material: walnut,
        tags: ["structural"],
      },
      {
        id: "top_panel",
        label: "Top Panel",
        type: "primitive",
        primitive: "rounded_box",
        dimensions: {
          width: "$width",
          height: `${PANEL_THICKNESS}`,
          depth: "$depth + 0.25",
          radius: "0.2",
        },
        position: [0, `$height - ${PANEL_THICKNESS * 0.5}`, "0.125"],
        material: walnutLight,
        tags: ["structural"],
      },
      {
        id: "bottom_panel",
        label: "Bottom Panel",
        type: "primitive",
        primitive: "rounded_box",
        dimensions: {
          width: `$width - ${PANEL_THICKNESS * 2}`,
          height: `${PANEL_THICKNESS}`,
          depth: "$depth",
          radius: "0.1",
        },
        position: [0, `${TOEKICK_HEIGHT} + ${PANEL_THICKNESS * 0.5}`, 0],
        material: walnut,
        tags: ["structural"],
      },
      {
        id: "back_panel",
        label: "Back Panel",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: `$width - ${PANEL_THICKNESS * 2}`,
          height: `$height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS}`,
          depth: `${BACK_THICKNESS}`,
        },
        position: [
          0,
          `(($height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS}) * 0.5) + ${TOEKICK_HEIGHT} + ${PANEL_THICKNESS}`,
          `$depth * -0.5 + ${BACK_THICKNESS * 0.5}`,
        ],
        material: backingBoard,
        tags: ["structural"],
      },

      // ── Toe Kick ─────────────────────────────────────────────────────
      {
        id: "toekick",
        label: "Toe Kick",
        type: "primitive",
        primitive: "rounded_box",
        dimensions: {
          width: `$width - ${PANEL_THICKNESS * 2}`,
          height: `${TOEKICK_HEIGHT}`,
          depth: `$depth - ${TOEKICK_INSET}`,
          radius: "0.1",
        },
        position: [0, `${TOEKICK_HEIGHT * 0.5}`, `${TOEKICK_INSET * -0.5}`],
        material: walnutDark,
        tags: ["structural"],
      },

      // ── Drawers (repeated) ───────────────────────────────────────────
      {
        id: "drawer_unit",
        label: "Drawer",
        type: "group",
        repeat: {
          count: "$drawerCount",
          axis: "y",
          spacing: `($height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS * 2}) / $drawerCount`,
          offset: `${TOEKICK_HEIGHT} + ${PANEL_THICKNESS} + ($height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS * 2}) / $drawerCount * 0.5`,
        },
        children: [
          // Drawer face — slightly inset from carcass edges
          {
            id: "drawer_face",
            label: "Drawer Face",
            type: "primitive",
            primitive: "rounded_box",
            dimensions: {
              width: `$width - ${PANEL_THICKNESS * 2} - ${DRAWER_GAP * 2}`,
              height: `($height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS * 2}) / $drawerCount - ${DRAWER_GAP}`,
              depth: `${PANEL_THICKNESS}`,
              radius: "0.2",
            },
            position: [0, 0, `$depth * 0.5 - ${PANEL_THICKNESS * 0.5}`],
            material: walnutLight,
            tags: ["drawer"],
          },
          // Handle — brushed nickel capsule bar
          {
            id: "handle",
            label: "Handle",
            type: "primitive",
            primitive: "capsule",
            dimensions: {
              radius: "0.2",
              length: "$width * 0.25",
            },
            position: [0, 0, `$depth * 0.5 + 0.3`],
            rotation: [0, 0, 90],
            material: brushedNickel,
            tags: ["hardware"],
          },
          // Handle standoffs (left)
          {
            id: "standoff_l",
            label: "Left Standoff",
            type: "primitive",
            primitive: "cylinder",
            dimensions: {
              radius: "0.15",
              height: "0.5",
            },
            position: [`$width * -0.125`, 0, `$depth * 0.5 + 0.1`],
            rotation: [90, 0, 0],
            material: brushedNickel,
            tags: ["hardware"],
          },
          // Handle standoffs (right)
          {
            id: "standoff_r",
            label: "Right Standoff",
            type: "primitive",
            primitive: "cylinder",
            dimensions: {
              radius: "0.15",
              height: "0.5",
            },
            position: [`$width * 0.125`, 0, `$depth * 0.5 + 0.1`],
            rotation: [90, 0, 0],
            material: brushedNickel,
            tags: ["hardware"],
          },
        ],
        tags: ["repeatable"],
      },

      // ── Shelf dividers between drawers ───────────────────────────────
      {
        id: "shelf",
        label: "Shelf Divider",
        type: "primitive",
        primitive: "box",
        dimensions: {
          width: `$width - ${PANEL_THICKNESS * 2} - 0.2`,
          height: "0.4",
          depth: `$depth - ${BACK_THICKNESS} - 0.5`,
        },
        repeat: {
          count: "$drawerCount - 1",
          axis: "y",
          spacing: `($height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS * 2}) / $drawerCount`,
          offset: `${TOEKICK_HEIGHT} + ${PANEL_THICKNESS} + ($height - ${TOEKICK_HEIGHT} - ${PANEL_THICKNESS * 2}) / $drawerCount`,
        },
        position: [0, 0, `${BACK_THICKNESS * -0.25}`],
        material: walnut,
        tags: ["structural"],
      },
    ],
  },
  constraints: [
    {
      id: "drawer-fit",
      rule: `$drawerCount * 6 <= $height - ${TOEKICK_HEIGHT + PANEL_THICKNESS * 2}`,
      errorMessage: "Too many drawers for this cabinet height",
      severity: "error",
    },
    {
      id: "proportion-warning",
      rule: "$width <= $height",
      errorMessage: "Cabinet looks better when height exceeds width",
      severity: "warning",
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
