"use client";
import { Summary, SchemaState, SchemaHistoryEntry, SchemaAIAnalysis, PagesData } from "./types";

let cached: Summary | null = null;

export async function loadSummary(): Promise<Summary> {
  if (cached) return cached;
  const res = await fetch("/data/summary.json");
  cached = await res.json();
  return cached!;
}

let cachedSchemaState: SchemaState | null = null;

export async function loadSchemaState(): Promise<SchemaState | null> {
  if (cachedSchemaState) return cachedSchemaState;
  try {
    const res = await fetch("/data/schema-state.json");
    if (!res.ok) return null;
    cachedSchemaState = await res.json();
    return cachedSchemaState;
  } catch {
    return null;
  }
}

let cachedSchemaHistory: SchemaHistoryEntry[] | null = null;

export async function loadSchemaHistory(): Promise<SchemaHistoryEntry[]> {
  if (cachedSchemaHistory) return cachedSchemaHistory;
  try {
    const res = await fetch("/data/schema-history.json");
    if (!res.ok) return [];
    cachedSchemaHistory = await res.json();
    return cachedSchemaHistory!;
  } catch {
    return [];
  }
}

let cachedSchemaAIAnalysis: SchemaAIAnalysis | null = null;

export async function loadSchemaAIAnalysis(): Promise<SchemaAIAnalysis | null> {
  if (cachedSchemaAIAnalysis) return cachedSchemaAIAnalysis;
  try {
    const res = await fetch("/data/schema-ai-analysis.json");
    if (!res.ok) return null;
    cachedSchemaAIAnalysis = await res.json();
    return cachedSchemaAIAnalysis;
  } catch {
    return null;
  }
}

let cachedPagesData: PagesData | null = null;

export async function loadPagesData(): Promise<PagesData | null> {
  if (cachedPagesData) return cachedPagesData;
  try {
    const res = await fetch("/data/pages-data.json");
    if (!res.ok) return null;
    cachedPagesData = await res.json();
    return cachedPagesData;
  } catch {
    return null;
  }
}
