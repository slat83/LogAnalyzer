"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-context";

interface GscHealthRow {
  report_date: string;
  data: Record<string, unknown>;
  uploaded_at: string;
}

export function useGscHealth(reportType: string, section?: string) {
  const { projectId, loading: projectLoading } = useProject();
  const [data, setData] = useState<GscHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectLoading) return;
    if (!projectId) { setError("NO_PROJECT"); setLoading(false); return; }

    setLoading(true);
    const params = new URLSearchParams({ type: reportType });
    if (section) params.set("section", section);
    fetch(`/api/projects/${projectId}/gsc-health?${params}`)
      .then((r) => r.json())
      .then((d) => { setData(d.data || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectId, projectLoading, reportType, section]);

  return { data, loading, error };
}

/** Fetch all sections for a report type at once */
export function useGscHealthAll(reportType: string) {
  const { projectId, loading: projectLoading } = useProject();
  const [data, setData] = useState<Record<string, GscHealthRow[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectLoading) return;
    if (!projectId) { setError("NO_PROJECT"); setLoading(false); return; }

    setLoading(true);
    fetch(`/api/projects/${projectId}/gsc-health?type=${reportType}`)
      .then((r) => r.json())
      .then((d) => {
        // Group by section
        const grouped: Record<string, GscHealthRow[]> = {};
        for (const row of d.data || []) {
          const sec = row.section || "default";
          if (!grouped[sec]) grouped[sec] = [];
          grouped[sec].push(row);
        }
        setData(grouped);
        setLoading(false);
      })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectId, projectLoading, reportType]);

  return { data, loading, error };
}
