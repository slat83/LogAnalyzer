"use client";

import { useState, useRef } from "react";
import { parseLogFiles, type ParseProgress } from "@/lib/parser";

interface Props {
  projectId: string;
  onComplete: () => void;
}

export default function LogUploader({ projectId, onComplete }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<ParseProgress | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleParse() {
    if (!files.length) return;
    setUploading(true);
    setError(null);

    try {
      // 1. Parse logs client-side
      const summary = await parseLogFiles(files, [], (p) => setProgress(p));

      // 2. Send summary to API for decomposition into DB tables
      setProgress((prev) => prev ? { ...prev, status: "parsing", currentFile: "Uploading to database..." } : null);

      const res = await fetch(`/api/projects/${projectId}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(summary),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Upload failed");
      }

      setProgress((prev) => prev ? { ...prev, status: "done", currentFile: "Complete!" } : null);
      onComplete();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      setProgress((prev) => prev ? { ...prev, status: "error", error: msg } : null);
    } finally {
      setUploading(false);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files || []);
    setFiles(selected);
    setProgress(null);
    setError(null);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(
      (f) => f.name.endsWith(".gz") || f.name.endsWith(".log")
    );
    setFiles(dropped);
    setProgress(null);
    setError(null);
  }

  const totalSize = files.reduce((s, f) => s + f.size, 0);
  const pctDone = progress && progress.totalFiles > 0
    ? Math.round((progress.filesProcessed / progress.totalFiles) * 100)
    : 0;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-semibold text-white">Upload Log Files</h3>
      <p className="text-gray-400 text-sm">
        Select .gz or .log files. Parsing happens in your browser — files are never uploaded to a server.
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-8 text-center cursor-pointer transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".gz,.log"
          onChange={handleFileSelect}
          className="hidden"
        />
        <div className="text-3xl mb-2">📁</div>
        {files.length > 0 ? (
          <div>
            <p className="text-white font-medium">{files.length} file(s) selected</p>
            <p className="text-gray-400 text-sm mt-1">
              {(totalSize / 1024 / 1024).toFixed(1)} MB total
            </p>
          </div>
        ) : (
          <p className="text-gray-500">Drop .gz or .log files here, or click to browse</p>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && !uploading && (
        <div className="space-y-1 max-h-40 overflow-auto">
          {files.map((f, i) => (
            <div key={i} className="text-xs text-gray-400 flex justify-between px-2">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 ml-2">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      {progress && (
        <div className="space-y-3">
          {/* File progress */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-300 font-medium">
              {progress.status === "done"
                ? "Complete!"
                : progress.currentFile || "Processing..."}
            </span>
            <span className="text-blue-400 font-mono text-xs">
              {progress.linesProcessed.toLocaleString()} lines
            </span>
          </div>

          {/* Overall progress bar */}
          <div>
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>File {Math.min(progress.filesProcessed + 1, progress.totalFiles)} of {progress.totalFiles}</span>
              <span>{progress.status === "done" ? "100" : pctDone}%</span>
            </div>
            <div className="w-full h-3 bg-gray-800 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-150 ${
                  progress.status === "done"
                    ? "bg-green-500"
                    : progress.status === "error"
                    ? "bg-red-500"
                    : "bg-blue-500"
                }`}
                style={{ width: `${progress.status === "done" ? 100 : pctDone}%` }}
              />
            </div>
          </div>

          {/* Per-file indicators */}
          {progress.totalFiles > 1 && (
            <div className="flex gap-1 flex-wrap">
              {files.map((f, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full flex-1 min-w-[12px] transition-colors duration-300 ${
                    i < progress.filesProcessed
                      ? "bg-green-500"
                      : i === progress.filesProcessed && progress.status === "parsing"
                      ? "bg-blue-500 animate-pulse"
                      : "bg-gray-700"
                  }`}
                  title={f.name}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={handleParse}
          disabled={!files.length || uploading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {uploading ? "Processing..." : "Parse & Upload"}
        </button>
        {files.length > 0 && !uploading && (
          <button
            onClick={() => { setFiles([]); setProgress(null); setError(null); }}
            className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
