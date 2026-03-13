/**
 * validator.ts -- QA Auditor validation engine for the Spokbee parametric pipeline.
 *
 * Validates an AssemblySchema + ParametricConfig against declared constraints,
 * counts the total node instances in the assembly tree, and computes an
 * estimated axis-aligned bounding box across all primitives.
 */

import type {
  AssemblyNode,
  AssemblySchema,
  Expression,
  ParametricConfig,
  ValidationResult,
} from "../types/assembly-schema";
import { evaluateComparison, evaluateExpression } from "./expression";

// ---------- Node counting ----------------------------------------------------

/**
 * Recursively count all node instances in the assembly tree.
 * A node with `repeat` is counted as repeat.count copies of its subtree.
 */
export function countNodes(
  node: AssemblyNode,
  config: ParametricConfig,
): number {
  // Start with 1 for this node itself
  let count = 1;

  // Add children recursively
  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child, config);
    }
  }

  // If this node repeats, multiply the entire subtree count by the repeat count
  if (node.repeat) {
    const repeatCount = evaluateExpression(node.repeat.count, config);
    count = count * Math.max(0, Math.floor(repeatCount));
  }

  return count;
}

// ---------- Bounding box estimation ------------------------------------------

/** Mutable bounding-box accumulator */
interface BBoxAccumulator {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

function initBBox(): BBoxAccumulator {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };
}

/** Expand the accumulator to include a point */
function expandPoint(
  bbox: BBoxAccumulator,
  x: number,
  y: number,
  z: number,
): void {
  if (x < bbox.minX) bbox.minX = x;
  if (y < bbox.minY) bbox.minY = y;
  if (z < bbox.minZ) bbox.minZ = z;
  if (x > bbox.maxX) bbox.maxX = x;
  if (y > bbox.maxY) bbox.maxY = y;
  if (z > bbox.maxZ) bbox.maxZ = z;
}

/** Expand the accumulator to include an axis-aligned box centred at (cx,cy,cz) with half-extents (hx,hy,hz) */
function expandBox(
  bbox: BBoxAccumulator,
  cx: number,
  cy: number,
  cz: number,
  hx: number,
  hy: number,
  hz: number,
): void {
  expandPoint(bbox, cx - hx, cy - hy, cz - hz);
  expandPoint(bbox, cx + hx, cy + hy, cz + hz);
}

/**
 * Resolve the half-extents of a primitive from its dimensions map.
 * Returns [halfX, halfY, halfZ].
 */
function primitiveHalfExtents(
  primitive: string,
  dimensions: Record<string, Expression> | undefined,
  config: ParametricConfig,
): [number, number, number] {
  if (!dimensions) return [0, 0, 0];

  const dim = (key: string, fallback: number = 0): number => {
    if (key in dimensions) {
      return evaluateExpression(dimensions[key], config);
    }
    return fallback;
  };

  switch (primitive) {
    case "box": {
      const w = dim("width", 1);
      const h = dim("height", 1);
      const d = dim("depth", 1);
      return [w / 2, h / 2, d / 2];
    }
    case "cylinder": {
      const r = dim("radius", 0.5);
      const ch = dim("height", 1);
      // Cylinder extends along Y; radius in XZ
      return [r, ch / 2, r];
    }
    case "sphere": {
      const r = dim("radius", 0.5);
      return [r, r, r];
    }
    case "cone": {
      const r = dim("radius", 0.5);
      const ch = dim("height", 1);
      return [r, ch / 2, r];
    }
    case "torus": {
      const major = dim("radius", 0.5);
      const minor = dim("tube", 0.1);
      return [major + minor, minor, major + minor];
    }
    case "extrusion": {
      // Approximate: treat as a box
      const w = dim("width", 1);
      const h = dim("height", 1);
      const d = dim("depth", 1);
      return [w / 2, h / 2, d / 2];
    }
    default:
      return [0, 0, 0];
  }
}

/**
 * Walk the assembly tree, accumulating bounding-box extents.
 * parentPos is the inherited world-space origin for this node (from parent transforms).
 */
function walkBBox(
  node: AssemblyNode,
  config: ParametricConfig,
  parentX: number,
  parentY: number,
  parentZ: number,
  bbox: BBoxAccumulator,
): void {
  // Resolve this node's local position (defaults to 0,0,0)
  let lx = 0;
  let ly = 0;
  let lz = 0;
  if (node.position) {
    lx = evaluateExpression(node.position[0], config);
    ly = evaluateExpression(node.position[1], config);
    lz = evaluateExpression(node.position[2], config);
  }

  // Determine repeat instances
  const repeatCount = node.repeat
    ? Math.max(0, Math.floor(evaluateExpression(node.repeat.count, config)))
    : 1;

  const repeatAxis = node.repeat?.axis ?? "y";
  const repeatSpacing = node.repeat
    ? evaluateExpression(node.repeat.spacing, config)
    : 0;
  const repeatOffset = node.repeat?.offset !== undefined
    ? evaluateExpression(node.repeat.offset, config)
    : 0;

  for (let i = 0; i < repeatCount; i++) {
    // Compute per-instance offset along the repeat axis
    let rx = 0;
    let ry = 0;
    let rz = 0;
    const instanceOffset = repeatOffset + i * repeatSpacing;

    switch (repeatAxis) {
      case "x": rx = instanceOffset; break;
      case "y": ry = instanceOffset; break;
      case "z": rz = instanceOffset; break;
    }

    const wx = parentX + lx + rx;
    const wy = parentY + ly + ry;
    const wz = parentZ + lz + rz;

    // If this is a primitive, expand the bbox with its geometry
    if (node.type === "primitive" && node.primitive) {
      const [hx, hy, hz] = primitiveHalfExtents(
        node.primitive,
        node.dimensions,
        config,
      );
      expandBox(bbox, wx, wy, wz, hx, hy, hz);
    }

    // Recurse into children (groups or nested primitives)
    if (node.children) {
      for (const child of node.children) {
        walkBBox(child, config, wx, wy, wz, bbox);
      }
    }
  }
}

/**
 * Estimate the axis-aligned bounding box of the entire assembly.
 * Returns min/max as [x, y, z] tuples.
 */
export function estimateBoundingBox(
  schema: AssemblySchema,
  config: ParametricConfig,
): { min: [number, number, number]; max: [number, number, number] } {
  const bbox = initBBox();
  walkBBox(schema.assembly, config, 0, 0, 0, bbox);

  // If no primitives were found, return a zero-sized box at the origin
  if (bbox.minX === Infinity) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
    };
  }

  return {
    min: [bbox.minX, bbox.minY, bbox.minZ],
    max: [bbox.maxX, bbox.maxY, bbox.maxZ],
  };
}

// ---------- Constraint validation --------------------------------------------

/**
 * Validate all constraints in an AssemblySchema against a ParametricConfig.
 *
 * For each constraint whose rule evaluates to false, a violation is recorded.
 * Also computes the total node count and estimated bounding box.
 */
export function validateConstraints(
  schema: AssemblySchema,
  config: ParametricConfig,
): ValidationResult {
  const violations: ValidationResult["violations"] = [];

  // Evaluate every constraint
  if (schema.constraints) {
    for (const constraint of schema.constraints) {
      try {
        const holds = evaluateComparison(constraint.rule, config);
        if (!holds) {
          violations.push({
            constraintId: constraint.id,
            rule: constraint.rule,
            message: constraint.errorMessage,
            severity: constraint.severity,
          });
        }
      } catch (err) {
        // If the expression itself is malformed, report it as an error violation
        violations.push({
          constraintId: constraint.id,
          rule: constraint.rule,
          message: `Failed to evaluate constraint: ${err instanceof Error ? err.message : String(err)}`,
          severity: "error",
        });
      }
    }
  }

  // Count all node instances
  const nodeCount = countNodes(schema.assembly, config);

  // Estimate bounding box
  const boundingBox = estimateBoundingBox(schema, config);

  // The result is valid only if there are no error-severity violations
  const hasError = violations.some((v) => v.severity === "error");

  return {
    valid: !hasError,
    violations,
    nodeCount,
    boundingBox,
  };
}
