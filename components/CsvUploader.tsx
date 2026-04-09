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
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

export default function CsvUploader({ projectId, onUploaded }: Props) {
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(selected: File[]) {
    const results: FileEntry[] = [];

    for (const file of selected) {
      try {
        let parsed: ParsedGscReport | null = null;

        if (file.name.endsWith(".zip")) {
          parsed = await parseGscZip(file);
        } else if (file.name.endsWith(".csv")) {
          const text = await file.text();
          parsed = parseGscCSV(text, file.name);
        }

        results.push({ file, parsed, status: "pending" });
      } catch (e) {
        console.error(`Failed to parse ${file.name}:`, e);
        results.push({ file, parsed: null, status: "pending" });
      }
    }

    setFiles(results);
  }

  async function handleUpload() {
    setUploading(true);
    const updated = [...files];

    for (let i = 0; i < updated.length; i++) {
      const f = updated[i];
      if (!f.parsed) continue;

      updated[i] = { ...f, status: "uploading" };
      setFiles([...updated]);

      try {
        // Send sections separately for proper deduplication
        const res = await fetch(`/api/projects/${projectId}/gsc-health/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: f.parsed.type, sections: f.parsed.sections }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        updated[i] = { ...f, status: "done" };
      } catch (err) {
        updated[i] = { ...f, status: "error", error: err instanceof Error ? err.message : "Failed" };
      }
      setFiles([...updated]);
    }

    setUploading(false);
    onUploaded?.();
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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-semibold text-white">Upload GSC Reports</h3>
      <p className="text-gray-400 text-sm">
        Drop ZIP or CSV files exported from Google Search Console. Report type is auto-detected from the filename.
      </p>

      <div
        onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".csv") || f.name.endsWith(".zip"))); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-6 text-center cursor-pointer transition-colors"
      >
        <input ref={inputRef} type="file" multiple accept=".csv,.zip" onChange={(e) => handleFiles(Array.from(e.target.files || []))} className="hidden" />
        <div className="text-2xl mb-1">📋</div>
        <p className="text-gray-500 text-sm">Drop .zip or .csv files from GSC</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="bg-gray-800/50 rounded-lg px-4 py-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-gray-300 text-sm truncate max-w-[200px]">{f.file.name}</span>
                  {f.parsed ? (
                    <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${TYPE_COLORS[f.parsed.type] || "bg-gray-700 text-gray-400"}`}>
                      {f.parsed.label}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-300 shrink-0">Unknown format</span>
                  )}
                </div>
                <div className="shrink-0 ml-2 flex items-center gap-2">
                  {f.parsed && (
                    <span className="text-gray-500 text-xs">
                      {f.parsed.sections.length} file{f.parsed.sections.length > 1 ? "s" : ""}, {f.parsed.totalRows} rows
                    </span>
                  )}
                  {f.status === "done" && <span className="text-green-400">✓</span>}
                  {f.status === "uploading" && <span className="text-blue-400 animate-pulse">...</span>}
                  {f.status === "error" && <span className="text-red-400 text-xs">{f.error}</span>}
                </div>
              </div>
              {/* Show sections within the zip */}
              {f.parsed && f.parsed.sections.length > 1 && (
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

          <div className="flex gap-3 mt-3">
            <button
              onClick={handleUpload}
              disabled={uploading || !files.some((f) => f.parsed)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
            >
              {uploading ? "Uploading..." : `Upload ${files.filter((f) => f.parsed).length} report(s)`}
            </button>
            <button
              onClick={() => setFiles([])}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-medium rounded-lg transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
