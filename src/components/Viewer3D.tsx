"use client";

import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  Environment,
  ContactShadows,
  Grid,
  useGLTF,
} from "@react-three/drei";
import {
  Suspense,
  useMemo,
  useEffect,
  useRef,
  Component,
  type ReactNode,
} from "react";
import * as THREE from "three";
import type { AssemblySchema, ParametricConfig } from "@/types/assembly-schema";
import { buildAssembly } from "@/engine/geometry-engine";
import { deformRodinMesh } from "@/engine/rodin-deformer";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Viewer3DProps {
  schema: AssemblySchema;
  config: ParametricConfig;
  refinedMeshUrl?: string;
  refinementBaselineConfig?: ParametricConfig;
  onRepeatCountChanged?: (changed: boolean) => void;
}

// ─── Dispose Helper ───────────────────────────────────────────────────────────

function disposeObject(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m: THREE.Material) => m.dispose());
      } else if (child.material) {
        child.material.dispose();
      }
    }
  });
}

// ─── Procedural Mesh (Assembly Schema + Config -> Three.js via geometry engine)

function ProceduralMesh({
  schema,
  config,
}: {
  schema: AssemblySchema;
  config: ParametricConfig;
}) {
  const prevGroupRef = useRef<THREE.Group | null>(null);

  const group = useMemo(() => {
    return buildAssembly(schema, config);
  }, [schema, config]);

  useEffect(() => {
    const prev = prevGroupRef.current;
    prevGroupRef.current = group;
    return () => {
      if (prev) disposeObject(prev);
    };
  }, [group]);

  return <primitive object={group} />;
}

// ─── Refined Parametric Mesh (Rodin GLB with parametric deformation) ─────────

function RefinedParametricMesh({
  url,
  schema,
  config,
  baselineConfig,
  onRepeatCountChanged,
}: {
  url: string;
  schema: AssemblySchema;
  config: ParametricConfig;
  baselineConfig: ParametricConfig;
  onRepeatCountChanged?: (changed: boolean) => void;
}) {
  const { scene } = useGLTF(url);

  // Normalize the raw Rodin scene once: scale to 2-unit box, ground on Y=0
  const normalizedScene = useMemo(() => {
    const cloned = scene.clone(true);
    const box = new THREE.Box3().setFromObject(cloned);
    if (!box.isEmpty()) {
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const scale = maxDim > 0 ? 2 / maxDim : 1;
      cloned.scale.set(scale, scale, scale);
      cloned.position.set(
        -center.x * scale,
        -box.min.y * scale,
        -center.z * scale
      );
    }
    return cloned;
  }, [scene]);

  const prevDeformedRef = useRef<THREE.Group | null>(null);

  // Deform the normalized Rodin mesh on every config change
  const deformed = useMemo(() => {
    const result = deformRodinMesh(
      normalizedScene,
      schema,
      baselineConfig,
      config
    );
    onRepeatCountChanged?.(result.repeatCountChanged);
    return result.scene;
  }, [normalizedScene, schema, baselineConfig, config, onRepeatCountChanged]);

  useEffect(() => {
    const prev = prevDeformedRef.current;
    prevDeformedRef.current = deformed;
    return () => {
      if (prev && prev !== normalizedScene) disposeObject(prev);
    };
  }, [deformed, normalizedScene]);

  return <primitive object={deformed} />;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────

class MeshErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: { children: ReactNode }) {
    if (prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ─── Loading Fallback ─────────────────────────────────────────────────────────

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#333" wireframe />
    </mesh>
  );
}

// ─── Main Viewer Component ────────────────────────────────────────────────────

export function Viewer3D({
  schema,
  config,
  refinedMeshUrl,
  refinementBaselineConfig,
  onRepeatCountChanged,
}: Viewer3DProps) {
  const hasRefinedMesh = !!(refinedMeshUrl && refinementBaselineConfig);

  return (
    <div className="w-full h-full rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800">
      <Canvas
        camera={{ position: [3, 2.5, 3], fov: 45 }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      >
        <color attach="background" args={["#0a0a0a"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[5, 8, 5]} intensity={1} castShadow />
        <directionalLight position={[-3, 4, -2]} intensity={0.3} />

        <Suspense fallback={<LoadingFallback />}>
          {hasRefinedMesh ? (
            <MeshErrorBoundary
              fallback={<ProceduralMesh schema={schema} config={config} />}
            >
              <RefinedParametricMesh
                url={refinedMeshUrl}
                schema={schema}
                config={config}
                baselineConfig={refinementBaselineConfig}
                onRepeatCountChanged={onRepeatCountChanged}
              />
            </MeshErrorBoundary>
          ) : (
            <ProceduralMesh schema={schema} config={config} />
          )}
          <ContactShadows
            position={[0, -0.01, 0]}
            opacity={0.4}
            scale={10}
            blur={2}
            far={4}
          />
          <Grid
            position={[0, 0, 0]}
            args={[10, 10]}
            cellSize={0.5}
            cellThickness={0.5}
            cellColor="#1a1a1a"
            sectionSize={2}
            sectionThickness={1}
            sectionColor="#2a2a2a"
            fadeDistance={10}
            infiniteGrid
          />
          <Environment preset="studio" />
        </Suspense>

        <OrbitControls
          makeDefault
          minDistance={2}
          maxDistance={10}
          minPolarAngle={0.2}
          maxPolarAngle={Math.PI / 2 - 0.1}
        />
      </Canvas>
    </div>
  );
}
