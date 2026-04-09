"use client";

import { useEffect, useState } from "react";
import { useProject } from "@/lib/project-context";

interface GscHealthRow {
  report_date: string;
  data: Record<string, unknown>;
  uploaded_at: string;
}

export function useGscHealth(reportType: string) {
  const { projectId, loading: projectLoading } = useProject();
  const [data, setData] = useState<GscHealthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (projectLoading) return;
    if (!projectId) { setError("NO_PROJECT"); setLoading(false); return; }

    setLoading(true);
    fetch(`/api/projects/${projectId}/gsc-health?type=${reportType}`)
      .then((r) => r.json())
      .then((d) => { setData(d.data || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectId, projectLoading, reportType]);

  return { data, loading, error };
}
