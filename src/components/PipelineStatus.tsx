"use client";

import { PipelineState, STAGE_LABELS } from "@/lib/pipeline";
import { Loader2, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface PipelineStatusProps {
  state: PipelineState;
}

export function PipelineStatus({ state }: PipelineStatusProps) {
  const isProcessing = !["idle", "ready", "refined", "error"].includes(state.stage);
  const isDone = state.stage === "ready" || state.stage === "refined";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
        state.stage === "error"
          ? "bg-red-950/50 border border-red-800 text-red-400"
          : isDone
          ? "bg-emerald-950/50 border border-emerald-800 text-emerald-400"
          : isProcessing
          ? "bg-violet-950/50 border border-violet-800 text-violet-400"
          : "bg-zinc-900 border border-zinc-800 text-zinc-500"
      }`}
    >
      {state.stage === "error" && <AlertCircle className="w-4 h-4 shrink-0" />}
      {isDone && <CheckCircle2 className="w-4 h-4 shrink-0" />}
      {state.stage === "idle" && <Sparkles className="w-4 h-4 shrink-0" />}
      {isProcessing && <Loader2 className="w-4 h-4 shrink-0 animate-spin" />}
      <span>{state.message || STAGE_LABELS[state.stage]}</span>
    </div>
  );
}
