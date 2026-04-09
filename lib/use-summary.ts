"use client";

import { useEffect, useState } from "react";
import { loadSummary } from "@/lib/data";
import { useProject } from "@/lib/project-context";
import type { Summary } from "@/lib/types";

export function useSummary() {
  const { projectId, loading: projectLoading } = useProject();
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (projectLoading) return;
    if (!projectId) {
      setError("NO_PROJECT");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    loadSummary()
      .then((s) => { setData(s); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [projectId, projectLoading]);

  return { data, error, loading };
}
