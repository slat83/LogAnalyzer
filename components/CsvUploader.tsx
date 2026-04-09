"use client";

import { useState, useRef } from "react";
import { parseGscCSV, type ParsedGscReport } from "@/lib/parser/gsc-csv";

interface Props {
  projectId: string;
  onUploaded?: () => void;
}

export default function CsvUploader({ projectId, onUploaded }: Props) {
  const [files, setFiles] = useState<{ file: File; parsed: ParsedGscReport | null; status: "pending" | "uploading" | "done" | "error"; error?: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(selected: File[]) {
    const results = await Promise.all(
      selected.map(async (file) => {
        const text = await file.text();
        const parsed = parseGscCSV(text);
        return { file, parsed, status: "pending" as const };
      })
    );
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
        const res = await fetch(`/api/projects/${projectId}/gsc-health/upload`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: f.parsed.type, rows: f.parsed.rows }),
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
    crawl_stats: "bg-blue-900/50 text-blue-300",
    crawl_errors: "bg-red-900/50 text-red-300",
    sitemap: "bg-green-900/50 text-green-300",
    canonical: "bg-purple-900/50 text-purple-300",
    "404_urls": "bg-orange-900/50 text-orange-300",
    core_web_vitals: "bg-yellow-900/50 text-yellow-300",
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <h3 className="text-lg font-semibold text-white">Upload GSC Reports</h3>
      <p className="text-gray-400 text-sm">
        Drop CSV files exported from Google Search Console. Report type is auto-detected from column headers.
      </p>

      <div
        onDrop={(e) => { e.preventDefault(); handleFiles(Array.from(e.dataTransfer.files).filter((f) => f.name.endsWith(".csv"))); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-700 hover:border-blue-600 rounded-xl p-6 text-center cursor-pointer transition-colors"
      >
        <input ref={inputRef} type="file" multiple accept=".csv" onChange={(e) => handleFiles(Array.from(e.target.files || []))} className="hidden" />
        <div className="text-2xl mb-1">📋</div>
        <p className="text-gray-500 text-sm">Drop .csv files or click to browse</p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f, i) => (
            <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded-lg px-4 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-400 text-sm truncate">{f.file.name}</span>
                {f.parsed ? (
                  <span className={`text-xs px-2 py-0.5 rounded ${TYPE_COLORS[f.parsed.type] || "bg-gray-700 text-gray-400"}`}>
                    {f.parsed.label} ({f.parsed.rows.length} rows)
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-red-900/50 text-red-300">
                    Unknown format
                  </span>
                )}
              </div>
              <div className="shrink-0 ml-2">
                {f.status === "done" && <span className="text-green-400 text-sm">✓</span>}
                {f.status === "uploading" && <span className="text-blue-400 text-sm animate-pulse">...</span>}
                {f.status === "error" && <span className="text-red-400 text-xs">{f.error}</span>}
              </div>
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
