export type PipelineStage =
  | "idle"
  | "uploading"
  | "analyzing"        // Gemini generating Assembly Schema
  | "ready"            // Procedural mesh ready, sliders active
  | "refining"         // Rodin post-processing the scaffold
  | "refined"          // Rodin mesh loaded
  | "error";

export interface PipelineState {
  stage: PipelineStage;
  progress: number;
  message: string;
  error?: string;
  imageDataUrl?: string;
  refinedMeshUrl?: string;  // Rodin-polished GLB URL (only after refinement)
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  idle: "Upload an image to begin",
  uploading: "Uploading image...",
  analyzing: "Analyzing image with Spokbee...",
  ready: "Parametric configurator ready",
  refining: "Refining mesh with Spokbee...",
  refined: "Spokbee-refined mesh loaded",
  error: "An error occurred",
};
