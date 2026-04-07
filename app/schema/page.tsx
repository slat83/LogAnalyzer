"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { loadSchemaState, loadSchemaHistory, loadSchemaAIAnalysis } from "../../lib/data";
import { SchemaState, SchemaHistoryEntry, SchemaUrlResult, SchemaAIAnalysis, SchemaAIResult, SchemaAIIssue } from "../../lib/types";
import Card from "../../components/Card";

const STATUS_COLORS: Record<string, string> = {
  OK: "bg-green-900 text-green-300 border border-green-700",
  WARNING: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  CRITICAL: "bg-red-900 text-red-300 border border-red-700",
};

const DELTA_COLORS: Record<string, string> = {
  BASELINE: "bg-gray-800 text-gray-400 border border-gray-700",
  OK: "bg-green-900 text-green-300 border border-green-700",
  NEW_ERROR: "bg-red-900 text-red-300 border border-red-700",
  FIXED: "bg-green-900 text-green-300 border border-green-700",
  DEGRADED: "bg-orange-900 text-orange-300 border border-orange-700",
  MISSING: "bg-red-900 text-red-300 border border-red-700",
};

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${className}`}>
      {text}
    </span>
  );
}

/** Generate a human-readable issue summary from result data */
function getIssueSummary(result: SchemaUrlResult): {
  text: string;
  color: string;
} {
  const missingMustHave = result.missingMustHave ?? [];
  const missingNiceToHave = result.missingNiceToHave ?? [];
  const hasMicrodata = result.hasMicrodataBreadcrumb ?? false;

  // Missing mustHave (CRITICAL) — but downgrade BreadcrumbList if Microdata present
  const criticalMissing = missingMustHave.filter(
    (t) => !(t === "BreadcrumbList" && hasMicrodata)
  );

  // No JSON-LD at all — only show as error if not covered by Microdata
  if (result.foundSchemaTypes.length === 0 && (result.mustHave?.length ?? 0) > 0) {
    if (hasMicrodata && criticalMissing.length === 0) {
      // All mustHave covered via Microdata — show positive message
      return {
        text: "BreadcrumbList via Microdata ✓",
        color: "text-gray-400",
      };
    }
    return {
      text: "No JSON-LD found",
      color: "text-red-400",
    };
  }

  if (criticalMissing.length > 0) {
    return {
      text: `Missing: ${criticalMissing.join(", ")}`,
      color: "text-red-400",
    };
  }

  // Build composite issue lines
  const lines: { text: string; color: string }[] = [];

  // BreadcrumbList via Microdata only
  if (missingMustHave.includes("BreadcrumbList") && hasMicrodata) {
    lines.push({ text: "BreadcrumbList via Microdata ✓", color: "text-gray-400" });
  }

  // Missing niceToHave — FAQPage is INFO (grey), others are WARNING (yellow)
  const faqMissingSum = missingNiceToHave.filter((t) => t === "FAQPage");
  const otherMissingSum = missingNiceToHave.filter((t) => t !== "FAQPage");
  if (otherMissingSum.length > 0) {
    lines.push({
      text: `Recommended: ${otherMissingSum.join(", ")}`,
      color: "text-yellow-400",
    });
  }
  if (faqMissingSum.length > 0) {
    lines.push({ text: "Recommended: FAQPage", color: "text-gray-500" });
  }

  // Has field errors
  if (result.errors.length > 0) {
    const byType: Record<string, string[]> = {};
    for (const err of result.errors) {
      const parts = err.field.split(".");
      const type = parts.length > 1 ? parts[0] : "Schema";
      const field = parts.length > 1 ? parts.slice(1).join(".") : err.field;
      if (!byType[type]) byType[type] = [];
      byType[type].push(field);
    }
    const summaryParts = Object.entries(byType)
      .slice(0, 2)
      .map(([type, fields]) => `${type}: no ${fields.slice(0, 2).join(", ")}`);
    lines.push({ text: summaryParts.join("; "), color: "text-orange-400" });
  }

  if (lines.length === 0) {
    return { text: "All schemas valid", color: "text-green-500" };
  }

  // Return primary line (first one)
  return lines[0];
}

/** Multi-line issue cell renderer */
function IssueCell({ result }: { result: SchemaUrlResult }) {
  const missingMustHave = result.missingMustHave ?? [];
  const missingNiceToHave = result.missingNiceToHave ?? [];
  const hasMicrodata = result.hasMicrodataBreadcrumb ?? false;

  const criticalMissing = missingMustHave.filter(
    (t) => !(t === "BreadcrumbList" && hasMicrodata)
  );

  const lines: { text: string; color: string }[] = [];

  // No JSON-LD — only show as error if not covered by Microdata
  if (result.foundSchemaTypes.length === 0 && (result.mustHave?.length ?? 0) > 0 && criticalMissing.length > 0) {
    lines.push({ text: "No JSON-LD found", color: "text-red-400" });
  } else {
    // BreadcrumbList via Microdata (no JSON-LD but OK via Microdata)
    if (result.foundSchemaTypes.length === 0 && hasMicrodata && criticalMissing.length === 0) {
      lines.push({ text: "BreadcrumbList via Microdata ✓", color: "text-gray-400" });
    }

    // CRITICAL missing mustHave (JSON-LD present but types missing)
    for (const t of criticalMissing) {
      lines.push({ text: `Missing: ${t}`, color: "text-red-400" });
    }

    // BreadcrumbList via Microdata (JSON-LD present for other types, but BreadcrumbList only via Microdata)
    if (result.foundSchemaTypes.length > 0 && missingMustHave.includes("BreadcrumbList") && hasMicrodata) {
      lines.push({ text: "BreadcrumbList via Microdata ✓", color: "text-gray-400" });
    }

    // Missing niceToHave — FAQPage is INFO (grey), others are WARNING (yellow)
    for (const t of missingNiceToHave) {
      if (t === "FAQPage") {
        lines.push({ text: "Recommended: FAQPage", color: "text-gray-500" });
      } else {
        lines.push({ text: `Recommended: ${t}`, color: "text-yellow-400" });
      }
    }
  }

  if (lines.length === 0) {
    return <span className="text-green-500">All schemas valid</span>;
  }

  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => (
        <div key={i} className={`text-xs ${line.color}`}>
          {line.text}
        </div>
      ))}
    </div>
  );
}

/** Short description for the Critical Issues panel */
function getCriticalDescription(result: SchemaUrlResult): string {
  const missingMustHave = result.missingMustHave ?? [];
  const hasMicrodata = result.hasMicrodataBreadcrumb ?? false;

  const parts: string[] = [];

  if (result.foundSchemaTypes.length === 0 && (result.mustHave?.length ?? 0) > 0) {
    parts.push("No JSON-LD");
    if (missingMustHave.length > 0) {
      parts.push(`missing ${missingMustHave.join(", ")}`);
    }
  } else if (missingMustHave.length > 0) {
    const critical = missingMustHave.filter(
      (t) => !(t === "BreadcrumbList" && hasMicrodata)
    );
    if (critical.length > 0) {
      parts.push(`missing ${critical.join(", ")}`);
    }
  } else if (result.errors.length > 0) {
    const fields = result.errors
      .slice(0, 3)
      .map((e) => e.field)
      .join(", ");
    parts.push(`issues: ${fields}`);
  }

  return parts.join(": ") || result.status;
}

// ─── AI Analysis Components ───────────────────────────────────────────────────

function getScoreColor(score: number): string {
  if (score >= 90) return "text-green-400";
  if (score >= 70) return "text-yellow-400";
  return "text-red-400";
}

function getScoreBg(score: number): string {
  if (score >= 90) return "bg-green-900 border-green-700";
  if (score >= 70) return "bg-yellow-900 border-yellow-700";
  return "bg-red-900 border-red-700";
}

function getScoreBarColor(score: number): string {
  if (score >= 90) return "bg-green-500";
  if (score >= 70) return "bg-yellow-500";
  return "bg-red-500";
}

const SEVERITY_BADGE: Record<string, string> = {
  error: "bg-red-900 text-red-300 border border-red-700",
  warning: "bg-yellow-900 text-yellow-300 border border-yellow-700",
  info: "bg-gray-800 text-gray-400 border border-gray-700",
};

function AIExpandableRow({ result }: { result: SchemaAIResult }) {
  const [expanded, setExpanded] = useState(false);
  const errorCount = result.issues?.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = result.issues?.filter((i) => i.severity === "warning").length ?? 0;
  const infoCount = result.issues?.filter((i) => i.severity === "info").length ?? 0;

  // Short URL label
  let urlLabel = result.url;
  try {
    const u = new URL(result.url);
    urlLabel = u.pathname === "/" ? u.hostname : u.pathname;
  } catch {}

  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2 max-w-[220px]">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline text-xs truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {urlLabel}
          </a>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="w-20 bg-gray-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-2 rounded-full ${getScoreBarColor(result.score)}`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${getScoreColor(result.score)}`}>
              {result.score}
            </span>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1 flex-wrap">
            {errorCount > 0 && (
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-red-900 text-red-300 border border-red-700">
                {errorCount}E
              </span>
            )}
            {warningCount > 0 && (
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-yellow-900 text-yellow-300 border border-yellow-700">
                {warningCount}W
              </span>
            )}
            {infoCount > 0 && (
              <span className="inline-block px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-800 text-gray-400 border border-gray-700">
                {infoCount}I
              </span>
            )}
            {result.issues?.length === 0 && (
              <span className="text-green-500 text-xs">✓ Clean</span>
            )}
          </div>
        </td>
        <td className="px-3 py-2 text-xs text-gray-400 max-w-[260px] truncate">{result.summary}</td>
        <td className="px-3 py-2 text-xs text-gray-500">{(result.types_detected || []).join(", ") || "—"}</td>
        <td className="px-3 py-2 text-xs text-gray-600">{expanded ? "▲" : "▼"}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/80">
          <td colSpan={6} className="px-6 py-4">
            <div className="space-y-3">
              <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
                Issues ({result.issues?.length ?? 0})
              </div>
              {result.issues && result.issues.length > 0 ? (
                <div className="space-y-2">
                  {result.issues.map((issue, i) => (
                    <div key={i} className="flex items-start gap-3 p-2 bg-gray-800/60 rounded-lg">
                      <span
                        className={`shrink-0 inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                          SEVERITY_BADGE[issue.severity] || SEVERITY_BADGE.info
                        }`}
                      >
                        {issue.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-gray-300 text-xs">{issue.description}</div>
                        {issue.fix && (
                          <div className="text-blue-400 text-xs mt-1">
                            <span className="text-gray-500">Fix: </span>
                            {issue.fix}
                          </div>
                        )}
                      </div>
                      {issue.type && (
                        <span className="shrink-0 text-xs text-gray-600 bg-gray-700 px-1.5 py-0.5 rounded">
                          {issue.type}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-green-400 text-xs">✅ No issues found</div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function AIAnalysisSection({ aiAnalysis }: { aiAnalysis: SchemaAIAnalysis | null }) {
  const [sortKey, setAISortKey] = useState<"score" | "errors" | "url">("score");
  const [sortDir, setAISortDir] = useState<"asc" | "desc">("asc");

  if (!aiAnalysis) {
    return (
      <div className="bg-gray-900 border border-gray-700 rounded-xl p-6">
        <h2 className="text-sm font-semibold text-gray-300 mb-3">🤖 AI Schema Analysis</h2>
        <div className="text-center py-8">
          <div className="text-gray-500 text-sm mb-2">No AI analysis yet.</div>
          <div className="text-gray-600 text-xs font-mono bg-gray-800 inline-block px-3 py-1 rounded">
            Run: node scripts/schema-ai-analyze.mjs
          </div>
        </div>
      </div>
    );
  }

  const results = aiAnalysis.results || [];
  const lastAnalysis = new Date(aiAnalysis.timestamp).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const avgScore = results.length > 0
    ? Math.round(results.reduce((acc, r) => acc + (r.score ?? 0), 0) / results.length)
    : 0;
  const totalErrors = results.reduce((acc, r) => acc + (r.issues?.filter(i => i.severity === "error").length ?? 0), 0);
  const totalWarnings = results.reduce((acc, r) => acc + (r.issues?.filter(i => i.severity === "warning").length ?? 0), 0);

  const sorted = [...results].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;
    if (sortKey === "score") {
      aVal = a.score ?? 0;
      bVal = b.score ?? 0;
    } else if (sortKey === "errors") {
      aVal = a.issues?.filter(i => i.severity === "error").length ?? 0;
      bVal = b.issues?.filter(i => i.severity === "error").length ?? 0;
    } else if (sortKey === "url") {
      aVal = a.url;
      bVal = b.url;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function toggleAISort(key: typeof sortKey) {
    if (sortKey === key) {
      setAISortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setAISortKey(key);
      setAISortDir(key === "score" ? "asc" : "desc");
    }
  }

  const aiSortIndicator = (key: typeof sortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="bg-gray-900 border border-purple-900/50 rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-purple-300">🤖 AI Schema Analysis</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Model: {aiAnalysis.model} · Last run: {lastAnalysis}
          </p>
        </div>
        <div className={`text-2xl font-bold ${getScoreColor(avgScore)}`}>
          Avg {avgScore}/100
        </div>
      </div>

      {/* Score overview bars */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-5">
        {results.map((r) => {
          let label = r.url;
          try {
            const u = new URL(r.url);
            label = u.pathname === "/" ? "homepage" : u.pathname.replace(/\/$/, "").split("/").pop() || u.pathname;
          } catch {}
          return (
            <div
              key={r.url}
              className={`border rounded-lg p-2 text-center ${getScoreBg(r.score)}`}
              title={r.url}
            >
              <div className={`text-lg font-bold ${getScoreColor(r.score)}`}>{r.score}</div>
              <div className="text-xs text-gray-400 truncate mt-0.5">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-4 text-xs text-gray-500">
        <span>
          URLs: <span className="text-gray-300 font-semibold">{results.length}</span>
        </span>
        <span>
          Errors: <span className="text-red-400 font-semibold">{totalErrors}</span>
        </span>
        <span>
          Warnings: <span className="text-yellow-400 font-semibold">{totalWarnings}</span>
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
              <th
                className="px-3 py-2 cursor-pointer hover:text-gray-300"
                onClick={() => toggleAISort("url")}
              >
                URL{aiSortIndicator("url")}
              </th>
              <th
                className="px-3 py-2 cursor-pointer hover:text-gray-300"
                onClick={() => toggleAISort("score")}
              >
                Score{aiSortIndicator("score")}
              </th>
              <th
                className="px-3 py-2 cursor-pointer hover:text-gray-300"
                onClick={() => toggleAISort("errors")}
              >
                Issues{aiSortIndicator("errors")}
              </th>
              <th className="px-3 py-2">Summary</th>
              <th className="px-3 py-2">Types</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((result) => (
              <AIExpandableRow key={result.url} result={result} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Existing ExpandableRow ───────────────────────────────────────────────────

function ExpandableRow({ result }: { result: SchemaUrlResult }) {
  const [expanded, setExpanded] = useState(false);
  const richResultsUrl = `https://search.google.com/test/rich-results?url=${encodeURIComponent(result.url)}`;
  const issue = getIssueSummary(result);

  return (
    <>
      <tr
        className="border-b border-gray-800 hover:bg-gray-800/50 cursor-pointer transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-3 py-2">
          <Badge text={result.status} className={STATUS_COLORS[result.status] || "bg-gray-800 text-gray-300 border border-gray-700"} />
        </td>
        <td className="px-3 py-2 max-w-[200px]">
          <a
            href={result.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:underline text-xs truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {result.url}
          </a>
        </td>
        <td className="px-3 py-2 text-xs text-gray-300">{result.pageType}</td>
        <td className="px-3 py-2 text-xs" onClick={(e) => e.stopPropagation()}>
          <IssueCell result={result} />
        </td>
        <td className="px-3 py-2">
          <Badge
            text={result.delta}
            className={DELTA_COLORS[result.delta] || "bg-gray-800 text-gray-300 border border-gray-700"}
          />
        </td>
        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
          <a
            href={richResultsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 text-xs underline"
          >
            Test ↗
          </a>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/80">
          <td colSpan={6} className="px-6 py-4">
            <div className="space-y-4">
              {/* mustHave vs niceToHave breakdown */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                    Must Have
                  </div>
                  {(result.mustHave ?? []).length > 0 ? (
                    <div className="space-y-0.5">
                      {(result.mustHave ?? []).map((t) => {
                        const missing = (result.missingMustHave ?? []).includes(t);
                        const microdataOk = t === "BreadcrumbList" && result.hasMicrodataBreadcrumb;
                        return (
                          <div key={t} className="text-xs flex items-center gap-1.5">
                            <span>{missing && !microdataOk ? "🔴" : microdataOk ? "🟡" : "✅"}</span>
                            <span className={missing && !microdataOk ? "text-red-400" : microdataOk ? "text-yellow-400" : "text-green-400"}>
                              {t}
                              {microdataOk && " (Microdata)"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">—</div>
                  )}
                </div>
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                    Nice To Have
                  </div>
                  {(result.niceToHave ?? []).length > 0 ? (
                    <div className="space-y-0.5">
                      {(result.niceToHave ?? []).map((t) => {
                        const missing = (result.missingNiceToHave ?? []).includes(t);
                        const microdataOk = t === "BreadcrumbList" && result.hasMicrodataBreadcrumb && !result.foundSchemaTypes.includes("BreadcrumbList");
                        const isFaqInfo = t === "FAQPage" && missing;
                        if (microdataOk) {
                          return (
                            <div key={t} className="text-xs flex items-center gap-1.5">
                              <span>✅</span>
                              <span className="text-gray-400">{t} (via Microdata ✓)</span>
                            </div>
                          );
                        }
                        if (isFaqInfo) {
                          return (
                            <div key={t} className="text-xs flex items-center gap-1.5">
                              <span>ℹ️</span>
                              <span className="text-gray-500">{t} (recommended)</span>
                            </div>
                          );
                        }
                        return (
                          <div key={t} className="text-xs flex items-center gap-1.5">
                            <span>{missing ? "🟡" : "✅"}</span>
                            <span className={missing ? "text-yellow-400" : "text-green-400"}>{t}</span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-xs text-gray-500">—</div>
                  )}
                </div>
              </div>

              {/* Found Schema */}
              <div>
                <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">
                  Found Schema Types
                </div>
                <div className="text-xs text-gray-300">
                  {result.foundSchemaTypes.length > 0
                    ? result.foundSchemaTypes.join(", ")
                    : <span className="text-red-400">None</span>}
                </div>
                {result.hasMicrodataBreadcrumb && (
                  <div className="text-xs text-gray-400 mt-1">
                    + BreadcrumbList via Microdata (HTML itemtype)
                  </div>
                )}
              </div>

              {/* Errors list */}
              {result.errors.length > 0 && (
                <div>
                  <div className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-2">
                    Field Errors ({result.errors.length})
                  </div>
                  <div className="space-y-1">
                    {result.errors.map((err, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <span
                          className={`shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded ${
                            err.severity === "CRITICAL"
                              ? "bg-red-900 text-red-300"
                              : "bg-yellow-900 text-yellow-300"
                          }`}
                        >
                          {err.severity}
                        </span>
                        <span className="text-gray-500 shrink-0">{err.field}:</span>
                        <span className="text-gray-300">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.errors.length === 0 && (
                <div className="text-xs text-green-400">✅ No field errors</div>
              )}

              {/* Rich Results link */}
              <div>
                <a
                  href={`https://search.google.com/test/rich-results?url=${encodeURIComponent(result.url)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-400 hover:text-blue-300 underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  🔍 Test in Google Rich Results Test ↗
                </a>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function SchemaPage() {
  const [state, setState] = useState<SchemaState | null>(null);
  const [history, setHistory] = useState<SchemaHistoryEntry[]>([]);
  const [aiAnalysis, setAiAnalysis] = useState<SchemaAIAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortKey, setSortKey] = useState<"status" | "pageType" | "errors">("status");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    Promise.all([loadSchemaState(), loadSchemaHistory(), loadSchemaAIAnalysis()]).then(([s, h, ai]) => {
      setState(s);
      setHistory(h);
      setAiAnalysis(ai);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading schema data...
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        No schema data available. Run the schema monitor script first.
      </div>
    );
  }

  const results = state.results;
  const total = results.length;
  const ok = results.filter((r) => r.status === "OK").length;
  const warning = results.filter((r) => r.status === "WARNING").length;
  const critical = results.filter((r) => r.status === "CRITICAL").length;
  const coverageRate = total > 0 ? ((ok / total) * 100).toFixed(1) : "0";

  const lastCheck = new Date(state.timestamp).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  // Changes section: URLs with notable delta
  const changedUrls = results.filter(
    (r) => !["BASELINE", "OK"].includes(r.delta)
  );

  // Critical issues (sorted by severity: most errors first)
  const criticalResults = results
    .filter((r) => r.status === "CRITICAL")
    .sort((a, b) => b.errors.length - a.errors.length);

  // Filter + sort table
  const filtered = results.filter((r) => {
    if (filterStatus === "all") return true;
    return r.status === filterStatus;
  });

  const sorted = [...filtered].sort((a, b) => {
    let aVal: number | string = 0;
    let bVal: number | string = 0;
    if (sortKey === "status") {
      const order = { CRITICAL: 0, WARNING: 1, OK: 2 };
      aVal = order[a.status as keyof typeof order] ?? 3;
      bVal = order[b.status as keyof typeof order] ?? 3;
    } else if (sortKey === "pageType") {
      aVal = a.pageType;
      bVal = b.pageType;
    } else if (sortKey === "errors") {
      aVal = a.errors.length;
      bVal = b.errors.length;
    }
    if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
    if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
    return 0;
  });

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sortIndicator = (key: typeof sortKey) =>
    sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">🏷️ Schema Monitor</h1>
        <p className="text-gray-400 text-sm mt-1">
          JSON-LD structured data health across epicvin.com pages
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card title="URLs Monitored" value={total} />
        <div className="bg-gray-900 border border-green-900 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-gray-400 mb-1">OK</div>
          <div className="text-lg md:text-2xl font-bold text-green-400">{ok}</div>
        </div>
        <div className="bg-gray-900 border border-yellow-900 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-gray-400 mb-1">Warning</div>
          <div className="text-lg md:text-2xl font-bold text-yellow-400">{warning}</div>
        </div>
        <div className="bg-gray-900 border border-red-900 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-gray-400 mb-1">Critical</div>
          <div className="text-lg md:text-2xl font-bold text-red-400">{critical}</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-gray-400 mb-1">Coverage Rate</div>
          <div className="text-lg md:text-2xl font-bold text-blue-400">{coverageRate}%</div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 md:p-4">
          <div className="text-xs md:text-sm text-gray-400 mb-1">Last Check</div>
          <div className="text-sm font-semibold text-gray-200 leading-tight">{lastCheck}</div>
        </div>
      </div>

      {/* Trend Chart */}
      {history.length > 1 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-300 mb-4">Schema Health Trend</h2>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#9CA3AF", fontSize: 11 }}
                tickLine={false}
              />
              <YAxis tick={{ fill: "#9CA3AF", fontSize: 11 }} tickLine={false} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#111827",
                  border: "1px solid #374151",
                  borderRadius: "8px",
                  color: "#F9FAFB",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="ok"
                stroke="#34D399"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="OK"
              />
              <Line
                type="monotone"
                dataKey="warning"
                stroke="#FBBF24"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Warning"
              />
              <Line
                type="monotone"
                dataKey="critical"
                stroke="#F87171"
                strokeWidth={2}
                dot={{ r: 3 }}
                name="Critical"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Critical Issues Section */}
      {criticalResults.length > 0 && (
        <div className="bg-gray-900 border border-red-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-red-400 mb-3">
            🚨 Critical Issues ({criticalResults.length})
          </h2>
          <div className="space-y-2">
            {criticalResults.map((r) => {
              const hostname = (() => {
                try {
                  return new URL(r.url).hostname + new URL(r.url).pathname;
                } catch {
                  return r.url;
                }
              })();
              return (
                <div
                  key={r.url}
                  className="flex items-start gap-3 text-sm py-2 border-b border-red-900/40 last:border-0"
                >
                  <span className="text-red-500 shrink-0 mt-0.5">●</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-red-300 font-medium">{hostname}</span>
                    <span className="text-gray-500 mx-2">—</span>
                    <span className="text-gray-400 text-xs">{getCriticalDescription(r)}</span>
                  </div>
                  <Badge
                    text={r.pageType}
                    className="bg-gray-800 text-gray-400 border border-gray-700 shrink-0"
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Changes Section */}
      {changedUrls.length > 0 && (
        <div className="bg-gray-900 border border-orange-900 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-orange-300 mb-3">
            ⚠️ Changes Since Last Run ({changedUrls.length})
          </h2>
          <div className="space-y-2">
            {changedUrls.map((r) => (
              <div
                key={r.url}
                className="flex items-center gap-3 text-sm py-2 border-b border-gray-800 last:border-0"
              >
                <Badge
                  text={r.delta}
                  className={DELTA_COLORS[r.delta] || "bg-gray-800 text-gray-300 border border-gray-700"}
                />
                <span className="text-gray-300 truncate flex-1">{r.url}</span>
                <Badge
                  text={r.status}
                  className={STATUS_COLORS[r.status] || "bg-gray-800 text-gray-300 border border-gray-700"}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-gray-300">All URLs</h2>
          <div className="flex gap-2">
            {["all", "OK", "WARNING", "CRITICAL"].map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`text-xs px-3 py-1 rounded-md border transition-colors ${
                  filterStatus === s
                    ? "bg-blue-600 border-blue-500 text-white"
                    : "bg-gray-800 border-gray-700 text-gray-400 hover:text-gray-200"
                }`}
              >
                {s === "all" ? `All (${total})` : s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                <th
                  className="px-3 py-2 cursor-pointer hover:text-gray-300"
                  onClick={() => toggleSort("status")}
                >
                  Status{sortIndicator("status")}
                </th>
                <th className="px-3 py-2">URL</th>
                <th
                  className="px-3 py-2 cursor-pointer hover:text-gray-300"
                  onClick={() => toggleSort("pageType")}
                >
                  Page Type{sortIndicator("pageType")}
                </th>
                <th className="px-3 py-2 text-yellow-500/80">Issue</th>
                <th className="px-3 py-2">Delta</th>
                <th className="px-3 py-2">Test ↗</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((result) => (
                <ExpandableRow key={result.url} result={result} />
              ))}
            </tbody>
          </table>
        </div>

        {sorted.length === 0 && (
          <div className="text-center py-8 text-gray-600">No results match the filter.</div>
        )}
      </div>

      {/* AI Analysis Section */}
      <AIAnalysisSection aiAnalysis={aiAnalysis} />
    </div>
  );
}
