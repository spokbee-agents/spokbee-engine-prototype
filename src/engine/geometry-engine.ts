import * as THREE from "three";
import type {
  AssemblySchema,
  AssemblyNode,
  Expression,
  MaterialDef,
  ParametricConfig,
} from "@/types/assembly-schema";
import { evaluateExpression } from "./expression";

export { evaluateExpression };

// ─── Material Builder ─────────────────────────────────────────────────────────

function buildMaterial(mat?: MaterialDef): THREE.MeshStandardMaterial {
  if (!mat) {
    return new THREE.MeshStandardMaterial({
      color: "#888888",
      roughness: 0.5,
      metalness: 0,
    });
  }
  return new THREE.MeshStandardMaterial({
    color: mat.color,
    roughness: mat.roughness,
    metalness: mat.metalness,
    opacity: mat.opacity ?? 1.0,
    transparent: (mat.opacity ?? 1.0) < 1,
  });
}

// ─── Geometry Builders ────────────────────────────────────────────────────────

function buildPrimitiveGeometry(
  primitive: string,
  dimensions: Record<string, Expression> | undefined,
  config: ParametricConfig
): THREE.BufferGeometry {
  const dim = (key: string, fallback: number = 1): number => {
    if (!dimensions || !(key in dimensions)) return fallback;
    return evaluateExpression(dimensions[key], config);
  };

  switch (primitive) {
    case "box":
      return new THREE.BoxGeometry(
        dim("width"),
        dim("height"),
        dim("depth")
      );

    case "cylinder": {
      const radius = dim("radius", 0.5);
      const height = dim("height");
      const radiusTop = dim("radiusTop", radius);
      const radiusBottom = dim("radiusBottom", radius);
      return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, 32);
    }

    case "sphere":
      return new THREE.SphereGeometry(dim("radius", 0.5), 32, 16);

    case "cone":
      return new THREE.ConeGeometry(dim("radius", 0.5), dim("height"), 32);

    case "torus":
      return new THREE.TorusGeometry(
        dim("radius", 0.5),
        dim("tube", 0.1),
        16,
        32
      );

    default:
      console.warn(
        `Unknown primitive type: "${primitive}", using box fallback`
      );
      return new THREE.BoxGeometry(
        dim("width", 0.5),
        dim("height", 0.5),
        dim("depth", 0.5)
      );
  }
}

// ─── Node Builder ─────────────────────────────────────────────────────────────

function buildNode(
  node: AssemblyNode,
  config: ParametricConfig
): THREE.Object3D {
  let object: THREE.Object3D;

  if (node.type === "primitive" && node.primitive) {
    const geometry = buildPrimitiveGeometry(
      node.primitive,
      node.dimensions,
      config
    );
    const material = buildMaterial(node.material);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    object = mesh;
  } else {
    object = new THREE.Group();
  }

  object.name = node.id;
  if (node.label) object.userData.label = node.label;

  if (node.position) {
    const x = evaluateExpression(node.position[0], config);
    const y = evaluateExpression(node.position[1], config);
    const z = evaluateExpression(node.position[2], config);
    object.position.set(x, y, z);
  }

  if (node.rotation) {
    object.rotation.set(
      THREE.MathUtils.degToRad(node.rotation[0]),
      THREE.MathUtils.degToRad(node.rotation[1]),
      THREE.MathUtils.degToRad(node.rotation[2])
    );
  }

  if (node.children) {
    for (const child of node.children) {
      const childObjects = buildNodeWithRepeat(child, config);
      for (const obj of childObjects) {
        object.add(obj);
      }
    }
  }

  return object;
}

function buildNodeWithRepeat(
  node: AssemblyNode,
  config: ParametricConfig
): THREE.Object3D[] {
  if (!node.repeat) {
    return [buildNode(node, config)];
  }

  const count = Math.round(evaluateExpression(node.repeat.count, config));
  const spacing = evaluateExpression(node.repeat.spacing, config);
  const offset =
    node.repeat.offset != null
      ? evaluateExpression(node.repeat.offset, config)
      : 0;
  const axis = node.repeat.axis;

  const results: THREE.Object3D[] = [];

  for (let i = 0; i < count; i++) {
    const instance = buildNode(node, config);
    const axisOffset = offset + i * spacing;
    switch (axis) {
      case "x":
        instance.position.x += axisOffset;
        break;
      case "y":
        instance.position.y += axisOffset;
        break;
      case "z":
        instance.position.z += axisOffset;
        break;
    }
    instance.name = `${node.id}_${i}`;
    results.push(instance);
  }

  return results;
}

// ─── Auto-centering ───────────────────────────────────────────────────────────

function autoCenterAndScale(group: THREE.Group): void {
  const box = new THREE.Box3().setFromObject(group);
  if (box.isEmpty()) return;

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = maxDim > 0 ? 2 / maxDim : 1;

  group.scale.set(scale, scale, scale);
  group.position.set(
    -center.x * scale,
    -box.min.y * scale,
    -center.z * scale
  );
}

// ─── Main Assembly Builder ────────────────────────────────────────────────────

/**
 * Build a Three.js scene graph from an AssemblySchema and parameter config.
 * The result is a THREE.Group auto-centered at origin and grounded on Y=0.
 */
export function buildAssembly(
  schema: AssemblySchema,
  config: ParametricConfig
): THREE.Group {
  const root = new THREE.Group();
  root.name = "assembly-root";

  const assemblyObjects = buildNodeWithRepeat(schema.assembly, config);
  for (const obj of assemblyObjects) {
    root.add(obj);
  }

  autoCenterAndScale(root);

  return root;
}
