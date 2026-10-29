"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

export type Project = { id: string; name: string; description: string | null; color: string; is_default: boolean; all_apps: boolean; kind: "personal" | "app"; created_at: string };
type Ctx = { projects: Project[]; current: string; setCurrent: (id: string) => void; currentProject?: Project; defaultProject?: Project; reload: () => Promise<void> };
const P = createContext<Ctx | null>(null);
const KEY = "lifevault:project";

/** Projekte des Nutzers und das gewählte Projekt („all“ = alle Projekte) */
export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [current, setCurrentState] = useState("all");
  const reload = useCallback(async () => {
    await supabase.rpc("ensure_default_project");
    const { data } = await supabase.from("projects").select("id,name,description,color,is_default,all_apps,kind,created_at").order("is_default", { ascending: false }).order("name");
    setProjects((data as Project[]) ?? []);
  }, []);
  useEffect(() => {
    try { setCurrentState(localStorage.getItem(KEY) || "all"); } catch { /* egal */ }
    void reload();
  }, [reload]);
  const setCurrent = useCallback((id: string) => {
    setCurrentState(id);
    try { localStorage.setItem(KEY, id); } catch { /* egal */ }
  }, []);
  const value = useMemo(() => {
    const currentProject = projects.find((p) => p.id === current);
    return { projects, current: currentProject ? current : "all", setCurrent, currentProject, defaultProject: projects.find((p) => p.is_default), reload };
  }, [projects, current, setCurrent, reload]);
  return <P.Provider value={value}>{children}</P.Provider>;
}

export function useProjects() {
  const v = useContext(P);
  if (!v) throw new Error("useProjects außerhalb von ProjectsProvider");
  return v;
}

export const PROJECT_COLORS = ["#6d4aff", "#2563eb", "#0d9488", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#475569"];
