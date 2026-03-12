export type PipelineStage =
  | "idle"
  | "uploading"
  | "generating-mesh"
  | "analyzing"
  | "generating-schema"
  | "ready"
  | "error";

export interface PipelineState {
  stage: PipelineStage;
  progress: number;
  message: string;
  error?: string;
  meshUrl?: string;
  imageDataUrl?: string;
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: "Upload an image to begin",
  uploading: "Uploading image...",
  "generating-mesh": "Generating 3D mesh via Rodin API...",
  analyzing: "Rendering mesh views for VLM analysis...",
  "generating-schema": "Generating parametric schema via Gemini...",
  ready: "Parametric configurator ready",
  error: "An error occurred",
};
