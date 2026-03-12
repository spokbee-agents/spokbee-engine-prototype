"use client";

import { useCallback, useState } from "react";
import { Upload, ImageIcon, X } from "lucide-react";

interface ImageUploaderProps {
  onImageSelected: (file: File, dataUrl: string) => void;
  disabled?: boolean;
}

export function ImageUploader({ onImageSelected, disabled }: ImageUploaderProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        setPreview(dataUrl);
        onImageSelected(file, dataUrl);
      };
      reader.readAsDataURL(file);
    },
    [onImageSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const clear = () => setPreview(null);

  return (
    <div className="w-full">
      {preview ? (
        <div className="relative rounded-xl border border-zinc-700 overflow-hidden bg-zinc-900">
          <img
            src={preview}
            alt="Uploaded product"
            className="w-full h-48 object-contain bg-zinc-950 p-2"
          />
          <button
            onClick={clear}
            className="absolute top-2 right-2 p-2 md:p-1 bg-zinc-800 rounded-full hover:bg-zinc-700 transition-colors"
            disabled={disabled}
          >
            <X className="w-5 h-5 md:w-4 md:h-4 text-zinc-400" />
          </button>
          <div className="px-3 py-2 text-xs text-zinc-500 border-t border-zinc-800">
            <ImageIcon className="w-3 h-3 inline mr-1" />
            Image ready for processing
          </div>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed transition-colors cursor-pointer ${
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
          <Upload className="w-8 h-8 text-zinc-500 mb-2" />
          <span className="text-sm text-zinc-400">
            Drop a product image or click to upload
          </span>
          <span className="text-xs text-zinc-600 mt-1">PNG, JPG up to 10MB</span>
          <input
            type="file"
            accept="image/*"
            onChange={handleChange}
            className="hidden"
            disabled={disabled}
          />
        </label>
      )}
    </div>
  );
}
