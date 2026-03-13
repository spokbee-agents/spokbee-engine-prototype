# Spokbee 4.0 — Parametric 3D Generation Engine

**2D Image → AI-Generated Mesh → Parametric Configurator**

A Next.js 15 prototype implementing the VLM-authored mesh transformation pipeline from the Spokbee 4.0 architecture.

## Architecture

1. **Image Upload** — User uploads a 2D product photo
2. **Mesh Generation** — Hyper3D Rodin Gen-2 API generates a GLB mesh
3. **VLM Analysis** — Gemini 2.5 Pro analyzes the mesh and generates a Parametric Manifest (JSON schema + Three.js transformation script)
4. **Parametric Viewer** — React Three Fiber renders the mesh with real-time parametric controls (sliders/toggles)

## Stack

- Next.js 15 (App Router, Turbopack)
- React Three Fiber + drei
- Tailwind CSS v4
- TypeScript
- Zod (manifest validation)
- three-bvh-csg (mesh operations)

## Getting Started

```bash
npm install
cp .env.local.example .env.local  # Add your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## API Keys

Set in `.env.local`:

- `FAL_KEY` or `RODIN_API_KEY` — [Hyper3D Rodin](https://hyper3d.ai) via fal for mesh generation
- `GEMINI_API_KEY` — [Google AI Studio](https://aistudio.google.com/apikey) for VLM analysis

**Demo mode works without keys** — the app returns mock responses to demonstrate the full UI/interaction flow.

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate-mesh/route.ts    # Rodin API integration
│   │   └── generate-schema/route.ts  # Gemini VLM analysis
│   ├── layout.tsx
│   ├── page.tsx                      # Main page with pipeline orchestration
│   └── globals.css
├── components/
│   ├── ControlPanel.tsx              # Dynamic parametric sliders
│   ├── ImageUploader.tsx             # Drag-and-drop image upload
│   ├── PipelineStatus.tsx            # Pipeline stage indicator
│   └── Viewer3D.tsx                  # R3F 3D viewer with procedural cabinet
├── lib/
│   ├── mock-data.ts                  # Mock manifest for demo mode
│   └── pipeline.ts                   # Pipeline state types
└── types/
    └── manifest.ts                   # Zod schemas for Parametric Manifest
```
