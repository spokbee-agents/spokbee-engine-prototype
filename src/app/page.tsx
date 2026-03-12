"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { ControlPanel } from "@/components/ControlPanel";
import { PipelineStatus } from "@/components/PipelineStatus";
import { MOCK_MANIFEST, applyParametricTransform } from "@/lib/mock-data";
import { PipelineState } from "@/lib/pipeline";
import { ParametricManifest, ParametricConfig } from "@/types/manifest";
import { Box, Layers, Sliders } from "lucide-react";

const Viewer3D = lazy(() =>
  import("@/components/Viewer3D").then((m) => ({ default: m.Viewer3D }))
);

export default function Home() {
  const [pipeline, setPipeline] = useState<PipelineState>({
    stage: "idle",
    progress: 0,
    message: "",
  });
  const [manifest, setManifest] = useState<ParametricManifest>(MOCK_MANIFEST);
  const [config, setConfig] = useState<ParametricConfig>(() => {
    const initial: ParametricConfig = {};
    MOCK_MANIFEST.parameters.forEach((p) => {
      initial[p.id] = p.default;
    });
    return initial;
  });

  const transforms = useMemo(
    () => applyParametricTransform(config, manifest),
    [config, manifest]
  );

  const handleImageSelected = useCallback(
    async (file: File, dataUrl: string) => {
      setPipeline({
        stage: "uploading",
        progress: 10,
        message: "Uploading image...",
        imageDataUrl: dataUrl,
      });

      try {
        // Step 1: Generate mesh via Rodin
        setPipeline((s) => ({
          ...s,
          stage: "generating-mesh",
          progress: 30,
          message: "Generating 3D mesh via Rodin API...",
        }));

        const meshFormData = new FormData();
        meshFormData.append("image", file);

        const meshRes = await fetch("/api/generate-mesh", {
          method: "POST",
          body: meshFormData,
        });
        const meshData = await meshRes.json();

        if (!meshRes.ok) throw new Error(meshData.error);

        // Step 2: Generate parametric schema via Gemini
        setPipeline((s) => ({
          ...s,
          stage: "generating-schema",
          progress: 60,
          message: "Analyzing product and generating parametric schema...",
          meshUrl: meshData.glbUrl,
        }));

        const schemaRes = await fetch("/api/generate-schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl }),
        });
        const schemaData = await schemaRes.json();

        if (!schemaRes.ok) throw new Error(schemaData.error);

        // Apply the generated manifest
        const newManifest = schemaData.manifest as ParametricManifest;
        setManifest(newManifest);

        // Reset config to defaults
        const newConfig: ParametricConfig = {};
        newManifest.parameters.forEach((p) => {
          newConfig[p.id] = p.default;
        });
        setConfig(newConfig);

        setPipeline({
          stage: "ready",
          progress: 100,
          message: schemaData.mock
            ? "Demo mode — configure parametric controls below"
            : "Parametric configurator ready",
          meshUrl: meshData.glbUrl,
          imageDataUrl: dataUrl,
        });
      } catch (err) {
        setPipeline({
          stage: "error",
          progress: 0,
          message:
            err instanceof Error ? err.message : "Pipeline failed",
          error: String(err),
        });
      }
    },
    []
  );

  const handleParamChange = useCallback((id: string, value: number) => {
    setConfig((prev) => ({ ...prev, [id]: value }));
  }, []);

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Box className="w-5 h-5 text-zinc-950" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">
              Spokbee 4.0
            </h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Parametric 3D Engine
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-600">
          <Layers className="w-3 h-3" />
          <span>VLM-Authored Mesh Transformation Pipeline</span>
        </div>
      </header>

      {/* Main content — stacks vertically on mobile, side-by-side on md+ */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* 3D Viewer — top on mobile (50vh), left 2/3 on desktop */}
        <section className="h-[50vh] md:h-auto md:flex-[2] p-3 md:p-4 shrink-0 md:shrink">
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950 rounded-xl border border-zinc-800">
                Loading 3D viewer...
              </div>
            }
          >
            <Viewer3D
              heightScale={transforms.heightScale}
              widthScale={transforms.widthScale}
              depthScale={transforms.depthScale}
              drawerCount={transforms.drawerCount}
              meshUrl={pipeline.meshUrl}
            />
          </Suspense>
        </section>

        {/* Control panel — scrolls below viewer on mobile, right 1/3 sidebar on desktop */}
        <aside className="flex-1 md:flex-[1] border-t md:border-t-0 md:border-l border-zinc-800 p-4 md:p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Pipeline status */}
          <PipelineStatus state={pipeline} />

          {/* Image upload */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Layers className="w-3 h-3" />
              Input
            </h3>
            <ImageUploader
              onImageSelected={handleImageSelected}
              disabled={
                pipeline.stage !== "idle" &&
                pipeline.stage !== "ready" &&
                pipeline.stage !== "error"
              }
            />
          </div>

          {/* Parametric controls */}
          <div>
            <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sliders className="w-3 h-3" />
              Configurator
            </h3>
            <ControlPanel
              parameters={manifest.parameters}
              config={config}
              onChange={handleParamChange}
            />
          </div>

          {/* Config JSON preview */}
          <div className="mt-auto pt-4 border-t border-zinc-800">
            <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">
              Config State
            </h3>
            <pre className="text-[10px] text-zinc-500 bg-zinc-900 rounded-lg p-2 overflow-x-auto font-mono">
              {JSON.stringify(config, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </main>
  );
}
