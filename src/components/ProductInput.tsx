"use client";

import { useCallback, useState } from "react";
import { Upload, ImageIcon, X, Send, Type, Wand2 } from "lucide-react";

interface ProductInputProps {
  onSubmit: (input: { file?: File; dataUrl?: string; prompt?: string }) => void;
  disabled?: boolean;
}

export function ProductInput({ onSubmit, disabled }: ProductInputProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [prompt, setPrompt] = useState("");

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setPreview(dataUrl);
      setStagedFile(file);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleGenerate = useCallback(() => {
    if (disabled) return;
    const trimmed = prompt.trim();
    if (!preview && !trimmed) return;

    onSubmit({
      ...(stagedFile && preview ? { file: stagedFile, dataUrl: preview } : {}),
      ...(trimmed ? { prompt: trimmed } : {}),
    });
  }, [prompt, preview, stagedFile, disabled, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate]
  );

  const clearImage = () => {
    setPreview(null);
    setStagedFile(null);
  };

  const hasInput = !!preview || !!prompt.trim();

  return (
    <div className="w-full space-y-2">
      {/* Text prompt */}
      <div className="flex items-start gap-2 rounded-lg border border-zinc-700 bg-zinc-900 focus-within:border-zinc-500 transition-colors">
        <Type className="w-4 h-4 text-zinc-500 mt-2.5 ml-3 shrink-0" />
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            preview
              ? "Add details to refine the image analysis..."
              : 'Describe a product... e.g. "wooden dining chair"'
          }
          disabled={disabled}
          rows={2}
          className="flex-1 bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 py-2 pr-2 resize-none outline-none disabled:opacity-50"
        />
        {/* Quick-send for text-only (no image staged) */}
        {!preview && (
          <button
            onClick={handleGenerate}
            disabled={disabled || !prompt.trim()}
            className="p-2 mt-1 mr-1 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Send className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Image area */}
      {preview ? (
        <div className="relative rounded-xl border border-zinc-700 overflow-hidden bg-zinc-900">
          <img
            src={preview}
            alt="Uploaded product"
            className="w-full h-36 object-contain bg-zinc-950 p-2"
          />
          <button
            onClick={clearImage}
            className="absolute top-2 right-2 p-2 md:p-1 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
            disabled={disabled}
          >
            <X className="w-5 h-5 md:w-4 md:h-4 text-zinc-400" />
          </button>
          <div className="px-3 py-1.5 text-xs text-zinc-500 border-t border-zinc-800">
            <ImageIcon className="w-3 h-3 inline mr-1" />
            {prompt.trim()
              ? "Image + description ready"
              : "Image staged — add a description or generate now"}
          </div>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full h-24 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
            dragActive
              ? "border-amber-500 bg-amber-500/10"
              : "border-zinc-700 hover:border-zinc-500 bg-zinc-900/50"
          } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
        >
          <Upload className="w-5 h-5 text-zinc-500 mb-1" />
          <span className="text-xs text-zinc-400">
            Drop an image or click to upload
          </span>
          <span className="text-[10px] text-zinc-600 mt-0.5">
            Optional — combine with text for best results
          </span>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={disabled}
          />
        </label>
      )}

      {/* Generate button — visible when image is staged */}
      {preview && (
        <button
          onClick={handleGenerate}
          disabled={disabled || !hasInput}
          className="flex items-center justify-center gap-2 w-full px-4 py-2 rounded-lg
            bg-amber-600 hover:bg-amber-500 text-sm font-medium text-white transition-colors
            disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Wand2 className="w-4 h-4" />
          Generate Configurator
        </button>
      )}
    </div>
  );
}
