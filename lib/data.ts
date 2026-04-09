"use client";
import { Summary, SchemaState, SchemaHistoryEntry, SchemaAIAnalysis, PagesIndex, ClusterData } from "./types";

// Cache keyed by project ID
let cachedProjectId: string | null = null;
let cached: Summary | null = null;

/**
 * Get the active project ID from localStorage.
 * Dashboard pages call loadSummary() which uses this to determine which project to query.
 */
function getActiveProjectId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("loganalyzer_active_project");
}

export async function loadSummary(): Promise<Summary> {
  const projectId = getActiveProjectId();
  if (!projectId) {
    throw new Error("NO_PROJECT");
  }

  // Return cached if same project
  if (cached && cachedProjectId === projectId) return cached;

  const res = await fetch(`/api/projects/${projectId}/summary`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Failed to load" }));
    throw new Error(err.error || "Failed to load summary");
  }

  cached = await res.json();
  cachedProjectId = projectId;
  return cached!;
}

/** Clear the cache (e.g., after uploading new analysis data). */
export function clearSummaryCache() {
  cached = null;
  cachedProjectId = null;
}

// Schema functions — wired to API
export async function loadSchemaState(): Promise<SchemaState | null> {
  const projectId = getActiveProjectId();
  if (!projectId) return null;
  try {
    const res = await fetch(`/api/projects/${projectId}/schema`);
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export async function loadSchemaHistory(): Promise<SchemaHistoryEntry[]> {
  const projectId = getActiveProjectId();
  if (!projectId) return [];
  try {
    const res = await fetch(`/api/projects/${projectId}/schema/history`);
    if (!res.ok) return [];
    return await res.json();
  } catch { return []; }
}

export async function loadSchemaAIAnalysis(): Promise<SchemaAIAnalysis | null> {
  return null; // AI analysis not yet implemented
}

export async function loadPagesIndex(): Promise<PagesIndex | null> {
  return null;
}

export async function loadClusterPages(_file: string): Promise<ClusterData | null> {
  return null;
}
