"use client";

import { useState, useRef } from "react";
import { parseGscCSV, parseGscZip, type ParsedGscReport } from "@/lib/parser/gsc-csv";

interface Props {
  projectId: string;
  onUploaded?: () => void;
}

interface FileEntry {
  file: File;
  parsed: ParsedGscReport | null;
  status: "reading" | "parsed" | "uploading" | "done" | "error";
  error?: string;
}

const TYPE_COLORS: Record<string, string> = {
  performance: "bg-blue-900/50 text-blue-300",
  crawl_stats: "bg-cyan-900/50 text-cyan-300",
  crawl_by_response: "bg-teal-900/50 text-teal-300",
  crawl_errors: "bg-red-900/50 text-red-300",
  coverage: "bg-indigo-900/50 text-indigo-300",
  sitemap: "bg-green-900/50 text-green-300",
  canonical: "bg-purple-900/50 text-purple-300",
  "404_urls": "bg-orange-900/50 text-orange-300",
  core_web_vitals: "bg-yellow-900/50 text-yellow-300",
};

export default function CsvUploader({ projectId, onUploaded }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [processing, setProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Parse files ONE BY ONE with progress
  async function handleFiles(selected: File[]) {
    const validFiles = selected.filter((f) => f.name.endsWith(".csv") || f.name.endsWith(".zip"));
    if (!validFiles.length) return;

    setProcessing(true);

    // Initialize all as "reading"
    const initial: FileEntry[] = validFiles.map((file) => ({
      file, parsed: null, status: "reading",
    }));
    setFiles(initial);

    // Parse sequentially so UI updates between each file
    for (let i = 0; i < initial.length; i++) {
      const file = initial[i].file;

      // Show which file is being read
      setFiles((prev) => prev.map((f, j) =>
        j === i ? { ...f, status: "reading" } : f
      ));

      // Yield to UI
      await new Promise((r) => setTimeout(r, 0));

      try {
        let parsed: ParsedGscReport | null = null;

        if (file.name.endsWith(".zip")) {
          parsed = await parseGscZip(file);
        } else {
          const text = await file.text();
          parsed = parseGscCSV(text, file.name);
        }

        setFiles((prev) => prev.map((f, j) =>
          j === i ? { ...f, parsed, status: "parsed" } : f
        ));
      } catch (e) {
        console.error(`Failed to parse ${file.name}:`, e);
        setFiles((prev) => prev.map((f, j) =>
          j === i ? { ...f, status: "error", error: e instanceof Error ? e.message : "Parse failed" } : f
        ));
      }
    }

    setProcessing(false);
  }

  // Upload sequentially with progress
  async function handleUpload() {
    const parsedFiles = files.filter((f) => f.parsed);
    if (!parsedFiles.length) return;

    setUploadProgress({ current: 0, total: parsedFiles.length });
    let uploadIdx = 0;

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (!f.parsed) continue;

      setFiles((prev) => prev.map((ff, j) =>
        j === i ? { ...ff, status: "uploading" } : ff
      ));

      try {
        const res = await fetch(`/api/projects/${projectId}/gsc-health/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: f.parsed.type, sections: f.parsed.sections }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const result = await res.json();
        setFiles((prev) => prev.map((ff, j) =>
          j === i ? { ...ff, status: "done", error: undefined } : ff
        ));

        uploadIdx++;
        setUploadProgress({ current: uploadIdx, total: parsedFiles.length });
      } catch (err) {
        setFiles((prev) => prev.map((ff, j) =>
          j === i ? { ...ff, status: "error", error: err instanceof Error ? err.message : "Failed" } : ff
        ));
        uploadIdx++;
        setUploadProgress({ current: uploadIdx, total: parsedFiles.length });
      }
    }

    setUploadProgress(null);
    onUploaded?.();
  }

  const isUploading = uploadProgress !== null;
  const parsedCount = files.filter((f) => f.parsed).length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const totalRows = files.reduce((s, f) => s + (f.parsed?.totalRows || 0), 0);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-semibold text-white">Upload GSC Reports</h3>
      <p className="text-gray-400 text-sm">
        Drop ZIP or CSV files exported from Google Search Console. Report type is auto-detected from the filename.
      </p>

      {/* Drop zone */}
      <div
        onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files)); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => !processing && !isUploading && inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          processing || isUploading
            ? "border-gray-800 cursor-not-allowed opacity-50"
            : "border-gray-700 hover:border-blue-600 cursor-pointer"
        }`}
      >
        <input ref={inputRef} type="file" multiple accept=".csv,.zip" onChange={(e) => handleFiles(Array.from(e.target.files || []))} className="hidden" />
        <div className="text-2xl mb-1">📋</div>
        <p className="text-gray-500 text-sm">Drop .zip or .csv files from GSC</p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className={`rounded-lg px-4 py-2.5 transition-all ${
              f.status === "uploading" ? "bg-blue-900/20 border border-blue-800/50" :
              f.status === "done" ? "bg-green-900/10 border border-green-800/30" :
              f.status === "error" ? "bg-red-900/10 border border-red-800/30" :
              f.status === "reading" ? "bg-gray-800/30 border border-gray-700/50 animate-pulse" :
              "bg-gray-800/50 border border-transparent"
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {/* Status icon */}
                  <span className="text-sm shrink-0">
                    {f.status === "reading" && "⏳"}
                    {f.status === "parsed" && "✅"}
                    {f.status === "uploading" && "⬆️"}
                    {f.status === "done" && "✅"}
                    {f.status === "error" && "❌"}
                  </span>

                  <span className="text-gray-300 text-sm truncate">{f.file.name}</span>

                  {f.status === "reading" && (
                    <span className="text-xs text-gray-500 animate-pulse shrink-0">Reading...</span>
                  )}

                  {f.parsed && (
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${TYPE_COLORS[f.parsed.type] || "bg-gray-700 text-gray-400"}`}>
                      {f.parsed.label}
                    </span>
                  )}

                  {!f.parsed && f.status !== "reading" && f.status !== "error" && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-300 shrink-0">Unknown</span>
                  )}
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {f.parsed && (
                    <span className="text-gray-500 text-xs">
                      {f.parsed.sections.length} csv{f.parsed.sections.length > 1 ? "s" : ""} · {f.parsed.totalRows} rows
                    </span>
                  )}
                  {f.status === "error" && f.error && (
                    <span className="text-red-400 text-xs max-w-[150px] truncate">{f.error}</span>
                  )}
                </div>
              </div>

              {/* Sections preview */}
              {f.parsed && f.parsed.sections.length > 1 && f.status !== "uploading" && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {f.parsed.sections.map((s, j) => (
                    <span key={j} className="text-[10px] bg-gray-700/50 text-gray-400 px-1.5 py-0.5 rounded">
                      {s.name.replace(/\.csv$/, "")} ({s.rows.length})
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {/* Upload progress bar */}
          {isUploading && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-gray-400">
                <span>Uploading {uploadProgress.current} of {uploadProgress.total}...</span>
                <span>{Math.round((uploadProgress.current / uploadProgress.total) * 100)}%</span>
              </div>
              <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-300"
                  style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {/* Summary */}
          {!processing && !isUploading && parsedCount > 0 && (
            <div className="text-xs text-gray-500 px-1">
              {parsedCount} report{parsedCount > 1 ? "s" : ""} ready · {totalRows.toLocaleString()} total rows
              {doneCount > 0 && ` · ${doneCount} uploaded`}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={isUploading || processing || parsedCount === 0}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {isUploading ? `Uploading ${uploadProgress.current}/${uploadProgress.total}...` :
               processing ? "Reading files..." :
               `Upload ${parsedCount} report${parsedCount > 1 ? "s" : ""}`}
            </button>
            {!isUploading && !processing && (
              <button
                onClick={() => setFiles([])}
                className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
