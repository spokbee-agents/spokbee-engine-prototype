"use client";

import {
  useState,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
} from "react";
import { ProductInput } from "@/components/ProductInput";
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
import {
  Box,
  Sliders,
  Sparkles,
  AlertTriangle,
  Send,
  Wand2,
  ArrowDown,
  Type,
  Image as ImageIcon,
  Zap,
} from "lucide-react";

const Viewer3D = lazy(() =>
  import("@/components/Viewer3D").then((m) => ({ default: m.Viewer3D }))
);

// ─── Landing sections ────────────────────────────────────────────────────────

function HeroInput({
  onSubmit,
  disabled,
}: {
  onSubmit: (prompt: string) => void;
  disabled: boolean;
}) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  return (
    <div className="w-full max-w-xl">
      <div className="flex items-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-900/80 backdrop-blur-sm px-4 py-3 focus-within:border-violet-500/50 transition-colors shadow-lg shadow-black/20">
        <Type className="w-4 h-4 text-zinc-500 shrink-0" />
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSubmit();
          }}
          placeholder='Describe a product... "oak standing desk with 3 drawers"'
          disabled={disabled}
          className="flex-1 bg-transparent text-sm text-zinc-200 placeholder:text-zinc-600 outline-none disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled || !value.trim()}
          className="p-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function HowItWorksCard({
  step,
  icon,
  title,
  description,
  delay,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  delay: string;
}) {
  return (
    <div className={`animate-in-delay-${delay} flex flex-col items-center text-center p-6 rounded-2xl border border-zinc-800/50 bg-zinc-900/30`}>
      <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
        {icon}
      </div>
      <span className="text-[10px] font-mono text-violet-400/60 uppercase tracking-widest mb-2">
        Step {step}
      </span>
      <h3 className="text-sm font-semibold text-zinc-200 mb-1">{title}</h3>
      <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

export default function Home() {
  const configuratorRef = useRef<HTMLDivElement>(null);
  const [hasStarted, setHasStarted] = useState(false);

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
  const [refinementBaselineConfig, setRefinementBaselineConfig] =
    useState<ParametricConfig | null>(null);
  const [repeatCountChanged, setRepeatCountChanged] = useState(false);

  useMemo(() => {
    const result = validateConstraints(schema, config);
    setValidationResult(result);
  }, [schema, config]);

  const scrollToConfigurator = useCallback(() => {
    setHasStarted(true);
    setTimeout(() => {
      configuratorRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  }, []);

  const handleInput = useCallback(
    async (input: { file?: File; dataUrl?: string; prompt?: string }) => {
      const { dataUrl, prompt } = input;
      const isTextOnly = !dataUrl && !!prompt;

      // Scroll to configurator
      scrollToConfigurator();

      setPipeline({
        stage: isTextOnly ? "analyzing" : "uploading",
        progress: isTextOnly ? 30 : 10,
        message: isTextOnly
          ? "Generating from description..."
          : "Uploading image...",
        imageDataUrl: dataUrl,
      });

      try {
        if (!isTextOnly) {
          setPipeline((s) => ({
            ...s,
            stage: "analyzing",
            progress: 40,
            message: "Analyzing image with Spokbee...",
          }));
        }

        const schemaRes = await fetch("/api/generate-schema", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(dataUrl ? { imageDataUrl: dataUrl } : {}),
            ...(prompt ? { productDescription: prompt } : {}),
          }),
        });
        const schemaData = await schemaRes.json();

        if (!schemaRes.ok) throw new Error(schemaData.error);

        const newSchema = schemaData.schema as AssemblySchema;
        setSchema(newSchema);

        const newConfig = getDefaultConfig(newSchema);
        setConfig(newConfig);

        setValidationResult(null);
        setRefinementBaselineConfig(null);
        setRepeatCountChanged(false);

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
    [scrollToConfigurator]
  );

  const handleHeroPrompt = useCallback(
    (prompt: string) => {
      handleInput({ prompt });
    },
    [handleInput]
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
      message: "Submitting to Spokbee for refinement...",
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

      if (!meshUrl && requestId) {
        setPipeline((s) => ({
          ...s,
          progress: 40,
          message: "Spokbee is refining the mesh...",
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
                ? "Spokbee is refining the mesh..."
                : "Refinement job queued...",
          }));
        }
      }

      if (!meshUrl) {
        throw new Error(
          "Mesh refinement timed out before a GLB URL was returned."
        );
      }

      setRefinementBaselineConfig({ ...config });

      setPipeline((s) => ({
        ...s,
        stage: "refined",
        progress: 100,
        message: "Spokbee-refined mesh loaded — sliders still active",
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
  }, [pipeline.imageDataUrl, config]);

  const hasViolations =
    validationResult && validationResult.violations.length > 0;

  const isProcessing =
    pipeline.stage !== "idle" &&
    pipeline.stage !== "ready" &&
    pipeline.stage !== "refined" &&
    pipeline.stage !== "error";

  return (
    <main className="bg-zinc-950 text-zinc-100 overflow-x-hidden">
      {/* ═══ Sticky Nav ═══ */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-zinc-800/60 bg-zinc-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 md:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
              <Box className="w-4 h-4 text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight">Spokbee</span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="#how-it-works"
              className="hidden sm:inline text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              How it works
            </a>
            <button
              onClick={scrollToConfigurator}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white transition-all active:scale-[0.98]"
            >
              Start creating
            </button>
          </div>
        </div>
      </nav>

      {/* ═══ Hero Section ═══ */}
      <section className="relative min-h-screen flex flex-col items-center justify-end pb-16 md:pb-24 px-4 pt-14">
        {/* Background 3D viewer */}
        <div className="absolute inset-0 pt-14 opacity-40">
          <Suspense fallback={null}>
            <Viewer3D
              schema={MOCK_ASSEMBLY_SCHEMA}
              config={getDefaultConfig(MOCK_ASSEMBLY_SCHEMA)}
              autoRotate
              className="w-full h-full"
            />
          </Suspense>
        </div>
        {/* Gradient overlay — heavier at bottom where text lives */}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/80 to-transparent" />

        {/* Hero content */}
        <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
          <p className="animate-in text-xs font-medium text-violet-400 uppercase tracking-widest">
            Parametric 3D Engine
          </p>

          <h1 className="animate-in text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1]">
            From words to{" "}
            <span className="text-gradient">configurable 3D</span>
          </h1>

          <p className="animate-in-delay-1 text-base sm:text-lg text-zinc-400 leading-relaxed max-w-xl">
            Describe a product or upload an image. Spokbee generates a
            parametric 3D model you can customize in real time.
          </p>

          {/* Hero prompt input */}
          <div className="animate-in-delay-2 w-full flex justify-center">
            <HeroInput onSubmit={handleHeroPrompt} disabled={isProcessing} />
          </div>

          <p className="animate-in-delay-3 text-xs text-zinc-600">
            No account required. Try it now.
          </p>

          {/* Scroll hint */}
          <div className="animate-in-delay-3 pt-6">
            <ArrowDown className="w-4 h-4 text-zinc-700 animate-bounce" />
          </div>
        </div>
      </section>

      {/* ═══ Value Props ═══ */}
      <section className="py-16 md:py-24 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <div className="animate-in flex flex-col items-center text-center p-6 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Zap className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                AI-powered generation
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Go from a text prompt or photo to a 3D model in seconds.
              </p>
            </div>
            <div className="animate-in flex flex-col items-center text-center p-6 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Sliders className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                Real-time customization
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Adjust dimensions, features, and materials with instant-feedback
                sliders.
              </p>
            </div>
            <div className="animate-in flex flex-col items-center text-center p-6 rounded-2xl border border-zinc-800/50 bg-zinc-900/30 hover:border-zinc-700/50 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-violet-600/10 border border-violet-500/20 flex items-center justify-center mb-4">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <h3 className="text-sm font-semibold text-zinc-200 mb-1">
                Production-ready output
              </h3>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Export high-fidelity meshes ready for rendering or e-commerce.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ How It Works ═══ */}
      <section id="how-it-works" className="py-16 md:py-24 px-4 border-t border-zinc-800/40">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-xs font-medium text-violet-400 uppercase tracking-widest mb-3">
              How it works
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              Three steps to a parametric model
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            <HowItWorksCard
              step={1}
              icon={<Type className="w-5 h-5 text-violet-400" />}
              title="Describe or upload"
              description="Type a text description or drop in a reference photo of any product."
              delay="1"
            />
            <HowItWorksCard
              step={2}
              icon={<Wand2 className="w-5 h-5 text-violet-400" />}
              title="Generate and adjust"
              description="AI produces a parametric 3D model — use sliders to dial in every dimension."
              delay="2"
            />
            <HowItWorksCard
              step={3}
              icon={<Sparkles className="w-5 h-5 text-violet-400" />}
              title="Refine and export"
              description="Apply AI mesh refinement for extra detail, then export the final model."
              delay="3"
            />
          </div>
        </div>
      </section>

      {/* ═══ CTA Banner ═══ */}
      <section className="py-16 px-4 border-t border-zinc-800/40">
        <div className="max-w-2xl mx-auto text-center space-y-5">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            Ready to build?
          </h2>
          <p className="text-sm text-zinc-400">
            Start generating configurable 3D models in seconds. No account
            required.
          </p>
          <button
            onClick={scrollToConfigurator}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-lg shadow-violet-500/20 transition-all active:scale-[0.98]"
          >
            <Wand2 className="w-4 h-4" />
            Start creating
          </button>
        </div>
      </section>

      {/* ═══ Configurator Workspace ═══ */}
      <div
        ref={configuratorRef}
        id="configurator"
        className={`min-h-screen border-t border-zinc-800/40 ${
          hasStarted ? "" : "pt-8"
        }`}
      >
        {/* Configurator header */}
        <div className="border-b border-zinc-800/60 px-4 md:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center">
              <Box className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-xs font-bold tracking-tight">
                Configurator
              </h2>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                Parametric Workspace
              </p>
            </div>
          </div>
        </div>

        {/* Configurator body */}
        <div className="flex flex-col md:flex-row" style={{ height: "calc(100vh - 49px)" }}>
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
                refinementBaselineConfig={
                  refinementBaselineConfig ?? undefined
                }
                onRepeatCountChanged={setRepeatCountChanged}
              />
            </Suspense>
          </section>

          {/* Sidebar */}
          <aside className="flex-1 md:flex-[1] border-t md:border-t-0 md:border-l border-zinc-800 p-4 flex flex-col gap-4 overflow-y-auto">
            {/* Pipeline status */}
            <PipelineStatus state={pipeline} />

            {/* Repeat count changed warning */}
            {repeatCountChanged && pipeline.refinedMeshUrl && (
              <div className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs bg-blue-950/50 border border-blue-800 text-blue-400">
                <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                <span>
                  Repeat count changed — re-refine for best visual results
                </span>
              </div>
            )}

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

            {/* Product input */}
            <div>
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <ImageIcon className="w-3 h-3" />
                Input
              </h3>
              <ProductInput onSubmit={handleInput} disabled={isProcessing} />
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

            {/* Refine button */}
            {(pipeline.stage === "ready" ||
              pipeline.stage === "refined" ||
              pipeline.stage === "refining") && (
              <div>
                <button
                  onClick={handleRefine}
                  disabled={
                    pipeline.stage === "refining" || !pipeline.imageDataUrl
                  }
                  title={
                    !pipeline.imageDataUrl
                      ? "Upload an image to enable refinement"
                      : undefined
                  }
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg
                    bg-gradient-to-r from-violet-600 to-indigo-600
                    hover:from-violet-500 hover:to-indigo-500
                    text-sm font-medium text-white
                    shadow-lg shadow-violet-500/20
                    transition-all active:scale-[0.98]
                    disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none disabled:from-zinc-700 disabled:to-zinc-700 disabled:text-zinc-400"
                >
                  <Sparkles className="w-4 h-4" />
                  Refine with Spokbee
                </button>
                {!pipeline.imageDataUrl && (
                  <p className="text-[10px] text-zinc-600 mt-1 text-center">
                    Requires an image input for mesh refinement
                  </p>
                )}
              </div>
            )}

            {/* Schema preview */}
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
      </div>

      {/* ═══ Footer ═══ */}
      <footer className="border-t border-zinc-800/40 py-6 px-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-[10px] text-zinc-600">
          <span>Spokbee 4.0 — Universal Parametric Pipeline</span>
          <span>Trusted by designers and makers worldwide.</span>
        </div>
      </footer>
    </main>
  );
}
