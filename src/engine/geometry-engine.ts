import * as THREE from "three";
import { Evaluator, Brush, ADDITION, SUBTRACTION, INTERSECTION } from "three-bvh-csg";
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

// ─── Rounded Box Helper ──────────────────────────────────────────────────────

function createRoundedBoxGeometry(
  width: number,
  height: number,
  depth: number,
  radius: number,
  segments: number = 4
): THREE.BufferGeometry {
  const r = Math.min(radius, width / 2, height / 2);
  const w = width / 2 - r;
  const h = height / 2 - r;

  const shape = new THREE.Shape();
  shape.moveTo(-w, -height / 2);
  shape.lineTo(w, -height / 2);
  shape.quadraticCurveTo(width / 2, -height / 2, width / 2, -h);
  shape.lineTo(width / 2, h);
  shape.quadraticCurveTo(width / 2, height / 2, w, height / 2);
  shape.lineTo(-w, height / 2);
  shape.quadraticCurveTo(-width / 2, height / 2, -width / 2, h);
  shape.lineTo(-width / 2, -h);
  shape.quadraticCurveTo(-width / 2, -height / 2, -w, -height / 2);

  const extrudeSettings: THREE.ExtrudeGeometryOptions = {
    depth: depth,
    bevelEnabled: true,
    bevelThickness: r,
    bevelSize: r,
    bevelSegments: segments,
    curveSegments: segments,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  geometry.center();
  return geometry;
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

    case "ellipsoid": {
      // Ellipsoid = sphere with non-uniform scale baked into geometry
      const eRadiusX = dim("radiusX", dim("radius", 0.5));
      const eRadiusY = dim("radiusY", dim("radius", 0.5));
      const eRadiusZ = dim("radiusZ", dim("radius", 0.5));
      const eSeg = Math.round(dim("segments", 32));
      const geo = new THREE.SphereGeometry(1, eSeg, Math.round(eSeg / 2));
      // Scale vertices to create ellipsoid
      const posAttr = geo.getAttribute("position");
      for (let i = 0; i < posAttr.count; i++) {
        posAttr.setXYZ(
          i,
          posAttr.getX(i) * eRadiusX,
          posAttr.getY(i) * eRadiusY,
          posAttr.getZ(i) * eRadiusZ
        );
      }
      posAttr.needsUpdate = true;
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
      return geo;
    }

    case "cone":
      return new THREE.ConeGeometry(dim("radius", 0.5), dim("height"), 32);

    case "torus":
      return new THREE.TorusGeometry(
        dim("radius", 0.5),
        dim("tube", 0.1),
        16,
        32
      );

    case "rounded_box": {
      const rbWidth = dim("width");
      const rbHeight = dim("height");
      const rbDepth = dim("depth");
      const rbRadius = dim("radius", Math.min(rbWidth, rbHeight, rbDepth) * 0.1);
      const rbSegments = Math.round(dim("segments", 4));
      return createRoundedBoxGeometry(rbWidth, rbHeight, rbDepth, rbRadius, rbSegments);
    }

    case "lathe": {
      const lRadius = dim("radius", 0.5);
      const lThickness = dim("thickness", 0.2);
      const lSegments = Math.round(dim("segments", 32));
      // Create a wheel/disc cross-section profile
      const points = [
        new THREE.Vector2(lRadius * 0.3, 0),
        new THREE.Vector2(lRadius, 0),
        new THREE.Vector2(lRadius, lThickness),
        new THREE.Vector2(lRadius * 0.3, lThickness),
      ];
      return new THREE.LatheGeometry(points, lSegments);
    }

    case "capsule": {
      const capRadius = dim("radius", 0.25);
      const capLength = dim("length", 1);
      const capSegments = Math.round(dim("capSegments", 10));
      const capRadial = Math.round(dim("radialSegments", 16));
      return new THREE.CapsuleGeometry(capRadius, capLength, capSegments, capRadial);
    }

    case "extrusion": {
      const exWidth = dim("width");
      const exHeight = dim("height");
      const exDepth = dim("depth");
      const exBevel = dim("bevel", Math.min(exWidth, exHeight) * 0.05);

      const halfW = exWidth / 2;
      const halfH = exHeight / 2;

      const exShape = new THREE.Shape();
      exShape.moveTo(-halfW, -halfH);
      exShape.lineTo(halfW, -halfH);
      exShape.lineTo(halfW, halfH);
      exShape.lineTo(-halfW, halfH);
      exShape.lineTo(-halfW, -halfH);

      const exGeo = new THREE.ExtrudeGeometry(exShape, {
        depth: exDepth,
        bevelEnabled: exBevel > 0,
        bevelThickness: exBevel,
        bevelSize: exBevel,
        bevelSegments: 3,
      });
      exGeo.center();
      return exGeo;
    }

    case "plane": {
      const plWidth = dim("width", 1);
      const plHeight = dim("height", 1);
      const plSeg = Math.round(dim("segments", 1));
      return new THREE.PlaneGeometry(plWidth, plHeight, plSeg, plSeg);
    }

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

// ─── CSG Helpers ─────────────────────────────────────────────────────────────

/** Recursively find the first Mesh in an Object3D hierarchy. */
function findFirstMesh(obj: THREE.Object3D): THREE.Mesh | null {
  if (obj instanceof THREE.Mesh) return obj;
  for (const child of obj.children) {
    const found = findFirstMesh(child);
    if (found) return found;
  }
  return null;
}

/** Convert a THREE.Mesh to a Brush for CSG operations, baking its world transform. */
function meshToBrush(mesh: THREE.Mesh): Brush {
  const brush = new Brush(mesh.geometry.clone(), mesh.material);
  brush.position.copy(mesh.position);
  brush.rotation.copy(mesh.rotation);
  brush.scale.copy(mesh.scale);
  // Apply any ancestor transforms
  if (mesh.parent) {
    mesh.updateMatrixWorld(true);
    brush.applyMatrix4(mesh.matrixWorld);
    brush.position.set(0, 0, 0);
    brush.rotation.set(0, 0, 0);
    brush.scale.set(1, 1, 1);
  }
  brush.updateMatrixWorld(true);
  return brush;
}

// ─── Node Builder ─────────────────────────────────────────────────────────────

function buildNode(
  node: AssemblyNode,
  config: ParametricConfig
): THREE.Object3D {
  let object: THREE.Object3D;

  // ─── CSG Boolean Operations ───────────────────────────────────────────────
  if (
    node.type === "group" &&
    node.boolean_op &&
    node.children &&
    node.children.length >= 2
  ) {
    const evaluator = new Evaluator();
    const op =
      node.boolean_op === "subtract"
        ? SUBTRACTION
        : node.boolean_op === "intersect"
          ? INTERSECTION
          : ADDITION;

    // Build all children and collect meshes
    const childMeshes: THREE.Mesh[] = [];
    for (const child of node.children) {
      const childObjects = buildNodeWithRepeat(child, config);
      for (const obj of childObjects) {
        obj.updateMatrixWorld(true);
        const mesh = findFirstMesh(obj);
        if (mesh) {
          // Bake world transform into geometry for CSG
          mesh.updateMatrixWorld(true);
          childMeshes.push(mesh);
        }
      }
    }

    if (childMeshes.length >= 2) {
      let baseBrush = meshToBrush(childMeshes[0]);
      baseBrush.updateMatrixWorld(true);

      for (let i = 1; i < childMeshes.length; i++) {
        const toolBrush = meshToBrush(childMeshes[i]);
        toolBrush.updateMatrixWorld(true);
        baseBrush = evaluator.evaluate(baseBrush, toolBrush, op);
      }

      // The result is a Brush (extends Mesh)
      const resultMesh = baseBrush as THREE.Mesh;
      resultMesh.geometry.computeVertexNormals();
      resultMesh.castShadow = true;
      resultMesh.receiveShadow = true;
      resultMesh.name = node.id;
      if (node.label) resultMesh.userData.label = node.label;

      if (node.position) {
        const x = evaluateExpression(node.position[0], config);
        const y = evaluateExpression(node.position[1], config);
        const z = evaluateExpression(node.position[2], config);
        resultMesh.position.set(x, y, z);
      }
      if (node.rotation) {
        resultMesh.rotation.set(
          THREE.MathUtils.degToRad(node.rotation[0]),
          THREE.MathUtils.degToRad(node.rotation[1]),
          THREE.MathUtils.degToRad(node.rotation[2])
        );
      }

      return resultMesh;
    }
    // Fall through to normal group if not enough meshes for CSG
  }

  // ─── Standard primitive / group building ─────────────────────────────────
  if (node.type === "primitive" && node.primitive) {
    const geometry = buildPrimitiveGeometry(
      node.primitive,
      node.dimensions,
      config
    );
    geometry.computeVertexNormals();
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
