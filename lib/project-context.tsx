"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ProjectContextType {
  projectId: string | null;
  setProjectId: (id: string | null) => void;
  loading: boolean;
}

const ProjectContext = createContext<ProjectContextType>({
  projectId: null,
  setProjectId: () => {},
  loading: true,
});

export function useProject() {
  return useContext(ProjectContext);
}

const STORAGE_KEY = "loganalyzer_active_project";

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [projectId, setProjectIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load from localStorage
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      setProjectIdState(saved);
    }
    setLoading(false);
  }, []);

  function setProjectId(id: string | null) {
    setProjectIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  return (
    <ProjectContext.Provider value={{ projectId, setProjectId, loading }}>
      {children}
    </ProjectContext.Provider>
  );
}
