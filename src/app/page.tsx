"use client";

import { useState, useCallback, useMemo, lazy, Suspense } from "react";
import { ImageUploader } from "@/components/ImageUploader";
import { ControlPanel } from "@/components/ControlPanel";
import { PipelineStatus } from "@/components/PipelineStatus";
import { MOCK_ASSEMBLY_SCHEMA, getDefaultConfig } from "@/lib/mock-data";
import { PipelineState } from "@/lib/pipeline";
import {
  AssemblySchema,
  ParametricConfig,
  ValidationResult,
} from "@/types/assembly-schema";
import { validateConstraints } from "@/engine/validator";
import { Box, Layers, Sliders, Sparkles, AlertTriangle } from "lucide-react";

const Viewer3D = lazy(() =>
  import("@/components/Viewer3D").then((m) => ({ default: m.Viewer3D }))
);

export default function Home() {
  const [pipeline, setPipeline] = useState<PipelineState>({
    stage: "idle",
    progress: 0,
    message: "",
  });
  const [schema, setSchema] = useState<AssemblySchema>(MOCK_ASSEMBLY_SCHEMA);
  const [config, setConfig] = useState<ParametricConfig>(() =>
    getDefaultConfig(MOCK_ASSEMBLY_SCHEMA)
  );
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);

  // QA Auditor: validate constraints on every config change
  useMemo(() => {
    const result = validateConstraints(schema, config);
    setValidationResult(result);
  }, [schema, config]);

  const handleImageSelected = useCallback(
    async (_file: File, dataUrl: string) => {
      setPipeline({
        stage: "uploading",
        progress: 10,
        message: "Uploading image...",
        imageDataUrl: dataUrl,
      });

      try {
        // Gemini analyzes image and generates Assembly Schema (PIR)
        setPipeline((s) => ({
          ...s,
          stage: "analyzing",
          progress: 40,
          message: "Analyzing image with Gemini...",
        }));

        const schemaRes = await fetch("/api/generate-schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl: dataUrl }),
        });
        const schemaData = await schemaRes.json();

        if (!schemaRes.ok) throw new Error(schemaData.error);

        // Apply the generated Assembly Schema
        const newSchema = schemaData.schema as AssemblySchema;
        setSchema(newSchema);

        // Compute default config from schema parameters
        const newConfig = getDefaultConfig(newSchema);
        setConfig(newConfig);

        // Clear any previous validation
        setValidationResult(null);

        setPipeline({
          stage: "ready",
          progress: 100,
          message: schemaData.mock
            ? "Demo mode — configure parametric controls below"
            : "Parametric configurator ready",
          imageDataUrl: dataUrl,
        });
      } catch (err) {
        setPipeline({
          stage: "error",
          progress: 0,
          message: err instanceof Error ? err.message : "Pipeline failed",
          error: String(err),
        });
      }
    },
    []
  );

  const handleParamChange = useCallback((id: string, value: number) => {
    setConfig((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleRefine = useCallback(async () => {
    if (!pipeline.imageDataUrl) return;

    setPipeline((s) => ({
      ...s,
      stage: "refining",
      progress: 20,
      message: "Submitting to Rodin for refinement...",
    }));

    try {
      const meshRes = await fetch("/api/refine-mesh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageDataUrl: pipeline.imageDataUrl }),
      });
      const meshData = await meshRes.json();

      if (!meshRes.ok) throw new Error(meshData.error);

      let meshUrl = meshData.glbUrl as string | null | undefined;
      const requestId = meshData.requestId as string | undefined;

      // Poll for completion if we got a requestId
      if (!meshUrl && requestId) {
        setPipeline((s) => ({
          ...s,
          progress: 40,
          message: "Rodin is refining the mesh...",
        }));

        const maxPolls = 180;
        for (let poll = 0; poll < maxPolls; poll += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000));

          const statusRes = await fetch(
            `/api/refine-mesh/status?requestId=${encodeURIComponent(requestId)}`,
            { method: "GET", cache: "no-store" }
          );
          const statusData = await statusRes.json();

          if (!statusRes.ok) throw new Error(statusData.error);

          if (statusData.status === "COMPLETED") {
            meshUrl = statusData.glbUrl as string | undefined;
            break;
          }

          const progress = Math.min(85, 40 + Math.floor((poll + 1) / 3));
          setPipeline((s) => ({
            ...s,
            progress,
            message:
              statusData.status === "IN_PROGRESS"
                ? "Rodin is refining the mesh..."
                : "Refinement job queued...",
          }));
        }
      }

      if (!meshUrl) {
        throw new Error(
          "Mesh refinement timed out before a GLB URL was returned."
        );
      }

      setPipeline((s) => ({
        ...s,
        stage: "refined",
        progress: 100,
        message: "Rodin-refined mesh loaded",
        refinedMeshUrl: meshUrl!,
      }));
    } catch (err) {
      setPipeline((s) => ({
        ...s,
        stage: "error",
        progress: 0,
        message: err instanceof Error ? err.message : "Refinement failed",
        error: String(err),
      }));
    }
  }, [pipeline.imageDataUrl]);

  const hasViolations =
    validationResult && validationResult.violations.length > 0;

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-800 px-4 md:px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500 flex items-center justify-center">
            <Box className="w-5 h-5 text-zinc-950" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-tight">Spokbee 5.0</h1>
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
              Universal Parametric Pipeline
            </p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-600">
          <Layers className="w-3 h-3" />
          <span>Assembly Schema Procedural Engine</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        {/* 3D Viewer */}
        <section className="h-[50vh] md:h-auto md:flex-[2] p-3 md:p-4 shrink-0 md:shrink">
          <Suspense
            fallback={
              <div className="w-full h-full flex items-center justify-center text-zinc-600 bg-zinc-950 rounded-xl border border-zinc-800">
                Loading 3D viewer...
              </div>
            }
          >
            <Viewer3D
              schema={schema}
              config={config}
              refinedMeshUrl={pipeline.refinedMeshUrl}
            />
          </Suspense>
        </section>

        {/* Sidebar */}
        <aside className="flex-1 md:flex-[1] border-t md:border-t-0 md:border-l border-zinc-800 p-4 md:p-4 flex flex-col gap-4 overflow-y-auto">
          {/* Pipeline status */}
          <PipelineStatus state={pipeline} />

          {/* Validation warnings/errors */}
          {hasViolations && (
            <div className="space-y-1">
              {validationResult!.violations.map((v, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
                    v.severity === "error"
                      ? "bg-red-950/50 border border-red-800 text-red-400"
                      : "bg-yellow-950/50 border border-yellow-800 text-yellow-400"
                  }`}
                >
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                  <span>{v.message}</span>
                </div>
              ))}
            </div>
          )}

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
                pipeline.stage !== "refined" &&
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
              parameters={schema.parameters}
              config={config}
              onChange={handleParamChange}
            />
          </div>

          {/* Refine with Rodin button */}
          {(pipeline.stage === "ready" || pipeline.stage === "refined" || pipeline.stage === "refining") && (
            <button
              onClick={handleRefine}
              disabled={pipeline.stage === "refining"}
              className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg
                border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 hover:border-zinc-600
                text-sm text-zinc-300 transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Sparkles className="w-4 h-4" />
              Refine with Rodin
            </button>
          )}

          {/* Assembly Schema JSON preview */}
          <div className="mt-auto pt-4 border-t border-zinc-800">
            <h3 className="text-[10px] font-semibold text-zinc-600 uppercase tracking-wider mb-2">
              Assembly Schema (PIR)
            </h3>
            <pre className="text-[10px] text-zinc-500 bg-zinc-900 rounded-lg p-2 overflow-x-auto font-mono max-h-48 overflow-y-auto">
              {JSON.stringify(schema, null, 2)}
            </pre>
          </div>
        </aside>
      </div>
    </main>
  );
}
