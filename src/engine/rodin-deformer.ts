import * as THREE from "three";
import type {
  AssemblySchema,
  AssemblyNode,
  ParametricConfig,
} from "@/types/assembly-schema";
import { evaluateExpression } from "./expression";
import { buildAssembly } from "./geometry-engine";

/**
 * Compute the bounding box size of the procedural assembly at a given config.
 * Returns a THREE.Vector3 with the dimensions.
 */
function computeProceduralSize(
  schema: AssemblySchema,
  config: ParametricConfig
): THREE.Vector3 {
  const group = buildAssembly(schema, config);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());

  // Dispose the temporary procedural geometry
  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m: THREE.Material) => m.dispose());
        } else {
          child.material.dispose();
        }
      }
    }
  });

  return size;
}

/**
 * Check if any repeat-count parameters changed between two configs.
 * Returns true if all repeat counts are the same.
 */
function repeatCountsMatch(
  node: AssemblyNode,
  baseConfig: ParametricConfig,
  currConfig: ParametricConfig
): boolean {
  if (node.repeat) {
    const baseCount = Math.round(
      evaluateExpression(node.repeat.count, baseConfig)
    );
    const currCount = Math.round(
      evaluateExpression(node.repeat.count, currConfig)
    );
    if (baseCount !== currCount) return false;
  }
  if (node.children) {
    for (const child of node.children) {
      if (!repeatCountsMatch(child, baseConfig, currConfig)) return false;
    }
  }
  return true;
}

/**
 * Deform a Rodin GLB scene to match parametric config changes.
 *
 * Strategy: compute the procedural bounding box at both baseline and current
 * configs, then apply proportional non-uniform scaling to the Rodin mesh.
 * The Rodin mesh keeps its high-fidelity detail but stretches/compresses
 * to match the parametric dimensions.
 *
 * Returns { scene, repeatCountChanged } where repeatCountChanged indicates
 * that the caller should show a warning or fall back to procedural.
 */
export function deformRodinMesh(
  rodinScene: THREE.Group,
  schema: AssemblySchema,
  baselineConfig: ParametricConfig,
  currentConfig: ParametricConfig
): { scene: THREE.Group; repeatCountChanged: boolean } {
  const repeatCountChanged = !repeatCountsMatch(
    schema.assembly,
    baselineConfig,
    currentConfig
  );

  // Compute procedural sizes at baseline and current config
  const baseSize = computeProceduralSize(schema, baselineConfig);
  const currSize = computeProceduralSize(schema, currentConfig);

  // Per-axis scale ratios
  const sx = baseSize.x > 0.001 ? currSize.x / baseSize.x : 1;
  const sy = baseSize.y > 0.001 ? currSize.y / baseSize.y : 1;
  const sz = baseSize.z > 0.001 ? currSize.z / baseSize.z : 1;

  // Clone the Rodin scene so we don't mutate the original
  const deformed = rodinScene.clone(true);

  // Apply non-uniform scale
  deformed.scale.set(
    deformed.scale.x * sx,
    deformed.scale.y * sy,
    deformed.scale.z * sz
  );

  // Re-center and ground on Y=0
  const box = new THREE.Box3().setFromObject(deformed);
  if (!box.isEmpty()) {
    const center = box.getCenter(new THREE.Vector3());
    deformed.position.set(
      deformed.position.x - center.x,
      deformed.position.y - box.min.y,
      deformed.position.z - center.z
    );
  }

  return { scene: deformed, repeatCountChanged };
}
