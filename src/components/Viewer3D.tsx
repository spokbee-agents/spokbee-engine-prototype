"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows, Grid, useGLTF } from "@react-three/drei";
import { Suspense, useMemo, useEffect, useRef, Component, type ReactNode } from "react";
import * as THREE from "three";

interface Viewer3DProps {
  heightScale: number;
  widthScale: number;
  depthScale: number;
  drawerCount: number;
  meshUrl?: string;
}

function Cabinet({
  heightScale,
  widthScale,
  depthScale,
  drawerCount,
}: Omit<Viewer3DProps, "meshUrl">) {
  const cabinetColor = "#8B7355";
  const drawerColor = "#A0926B";
  const handleColor = "#C0C0C0";

  const baseW = 1;
  const baseH = 2;
  const baseD = 0.6;
  const panelThickness = 0.04;

  const w = baseW * widthScale;
  const h = baseH * heightScale;
  const d = baseD * depthScale;

  const drawerConfigs = useMemo(() => {
    const count = Math.round(drawerCount);
    const topMargin = panelThickness;
    const bottomMargin = panelThickness;
    const usableHeight = h - topMargin - bottomMargin;
    const gap = 0.02;
    const drawerH = (usableHeight - gap * (count + 1)) / count;
    const configs = [];
    for (let i = 0; i < count; i++) {
      const y = bottomMargin + gap + i * (drawerH + gap) + drawerH / 2;
      configs.push({ y, height: drawerH });
    }
    return configs;
  }, [drawerCount, h]);

  const woodMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: cabinetColor, roughness: 0.7, metalness: 0.05 }),
    []
  );
  const drawerMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: drawerColor, roughness: 0.6, metalness: 0.05 }),
    []
  );
  const handleMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: handleColor, roughness: 0.3, metalness: 0.8 }),
    []
  );

  return (
    <group position={[0, h / 2, 0]}>
      {/* Back panel */}
      <mesh position={[0, 0, -d / 2 + panelThickness / 2]} material={woodMaterial}>
        <boxGeometry args={[w, h, panelThickness]} />
      </mesh>

      {/* Left panel */}
      <mesh position={[-w / 2 + panelThickness / 2, 0, 0]} material={woodMaterial}>
        <boxGeometry args={[panelThickness, h, d]} />
      </mesh>

      {/* Right panel */}
      <mesh position={[w / 2 - panelThickness / 2, 0, 0]} material={woodMaterial}>
        <boxGeometry args={[panelThickness, h, d]} />
      </mesh>

      {/* Top panel */}
      <mesh position={[0, h / 2 - panelThickness / 2, 0]} material={woodMaterial}>
        <boxGeometry args={[w + 0.02, panelThickness, d + 0.02]} />
      </mesh>

      {/* Bottom panel */}
      <mesh position={[0, -h / 2 + panelThickness / 2, 0]} material={woodMaterial}>
        <boxGeometry args={[w, panelThickness, d]} />
      </mesh>

      {/* Drawers */}
      {drawerConfigs.map((dc, i) => (
        <group key={i} position={[0, dc.y - h / 2, d / 2 - 0.02]}>
          {/* Drawer face */}
          <mesh material={drawerMaterial}>
            <boxGeometry
              args={[w - panelThickness * 2 - 0.02, dc.height - 0.01, panelThickness]}
            />
          </mesh>
          {/* Handle */}
          <mesh
            position={[0, 0, panelThickness / 2 + 0.01]}
            material={handleMaterial}
          >
            <boxGeometry args={[w * 0.3, 0.02, 0.02]} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function GLBMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    // Center and scale the loaded model
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Scale to fit within a 2-unit bounding box
    const maxDim = Math.max(size.x, size.y, size.z);
    const scale = maxDim > 0 ? 2 / maxDim : 1;

    scene.scale.setScalar(scale);
    scene.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
  }, [scene]);

  return (
    <group ref={groupRef}>
      <primitive object={scene} />
    </group>
  );
}

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

function LoadingFallback() {
  return (
    <mesh>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="#333" wireframe />
    </mesh>
  );
}

export function Viewer3D(props: Viewer3DProps) {
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
          {props.meshUrl ? (
            <MeshErrorBoundary
              fallback={
                <Cabinet
                  heightScale={props.heightScale}
                  widthScale={props.widthScale}
                  depthScale={props.depthScale}
                  drawerCount={props.drawerCount}
                />
              }
            >
              <GLBMesh url={props.meshUrl} />
            </MeshErrorBoundary>
          ) : (
            <Cabinet
              heightScale={props.heightScale}
              widthScale={props.widthScale}
              depthScale={props.depthScale}
              drawerCount={props.drawerCount}
            />
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
