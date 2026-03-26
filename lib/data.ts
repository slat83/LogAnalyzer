"use client";
import { Summary } from "./types";

let cached: Summary | null = null;

export async function loadSummary(): Promise<Summary> {
  if (cached) return cached;
  const res = await fetch("/data/summary.json");
  cached = await res.json();
  return cached!;
}
