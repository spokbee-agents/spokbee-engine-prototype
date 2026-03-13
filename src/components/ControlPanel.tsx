"use client";

import { Parameter, ParametricConfig } from "@/types/assembly-schema";

interface ControlPanelProps {
  parameters: Parameter[];
  config: ParametricConfig;
  onChange: (id: string, value: number) => void;
}

export function ControlPanel({ parameters, config, onChange }: ControlPanelProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">
        Parameters
      </h3>
      {parameters.map((param) => {
        const value = config[param.id] ?? param.default;
        return (
          <div key={param.id} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">{param.label}</label>
              <span className="text-sm font-mono text-violet-400">
                {param.type === "discrete" ? Math.round(value) : value.toFixed(1)}
                {param.unit ? ` ${param.unit}` : ""}
              </span>
            </div>
            <input
              type="range"
              min={param.min}
              max={param.max}
              step={param.step ?? (param.type === "discrete" ? 1 : 0.1)}
              value={value}
              onChange={(e) => onChange(param.id, parseFloat(e.target.value))}
              className="w-full h-2 md:h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer
                [&::-webkit-slider-thumb]:appearance-none
                [&::-webkit-slider-thumb]:w-6
                [&::-webkit-slider-thumb]:h-6
                [&::-webkit-slider-thumb]:md:w-4
                [&::-webkit-slider-thumb]:md:h-4
                [&::-webkit-slider-thumb]:rounded-full
                [&::-webkit-slider-thumb]:bg-violet-500
                [&::-webkit-slider-thumb]:hover:bg-violet-400
                [&::-webkit-slider-thumb]:transition-colors"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>{param.min}{param.unit ? ` ${param.unit}` : ""}</span>
              <span>{param.max}{param.unit ? ` ${param.unit}` : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
