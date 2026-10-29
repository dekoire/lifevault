"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Check, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Dot } from "@/components/ProjectSwitcher";
import { CARD, ICON_BTN, Switch } from "@/components/ui";
import { useDocs } from "@/lib/docs";
import { PROJECT_COLORS, useProjects, type Project } from "@/lib/projects";
import { supabase } from "@/lib/supabase";

const field = "h-11 w-full rounded-xl border border-card-line bg-surface px-3.5 text-[15px] outline-none focus:border-brand-500";

/** Projekte anlegen, umbenennen, für alle Apps freigeben, löschen */
export function ProjectsSettings() {
  const { projects, reload } = useProjects();
  const { allDocs, refresh } = useDocs();
  const params = useSearchParams();
  const [creating, setCreating] = useState(params.get("neu") === "1");
  const [editing, setEditing] = useState<string>();
  const count = (id: string) => allDocs.filter((d) => d.project_id === id).length;

  const save = async (p: Partial<Project>, id?: string) => {
    const { error } = id ? await supabase.from("projects").update(p).eq("id", id) : await supabase.from("projects").insert(p);
    if (error) return alert(error.message);
    setCreating(false); setEditing(undefined);
    await reload();
  };
  const remove = async (p: Project) => {
    if (!confirm(`Projekt „${p.name}“ löschen? Die ${count(p.id)} Dokumente darin kommen nach „Meine Daten“.`)) return;
    const { error } = await supabase.from("projects").delete().eq("id", p.id);
    if (error) return alert(error.message);
    await reload(); await refresh();
  };

  return (
    <>
      <p className="text-[14px] leading-6 text-soft">Mit Projekten trennst du Unterlagen, z. B. „Wohnung Kauf“, „Steuer 2026“ oder „Firma“. Jede verbundene App bekommt nur die Projekte, die du ihr freigibst. Projekte mit <b>„Für alle Apps“</b> sind allgemeine Daten, die jede App lesen darf – jeweils nur im Rahmen ihrer Datenschutz-Einstellungen.</p>
      {creating ? <ProjectForm onCancel={() => setCreating(false)} onSave={(p) => save(p)} /> : (
        <button type="button" onClick={() => setCreating(true)} className="inline-flex h-11 items-center gap-2 rounded-full bg-brand-500 px-5 text-[14px] font-semibold text-white hover:bg-brand-600"><Plus size={17} /> Neues Projekt</button>
      )}
      <section className={`${CARD} divide-y divide-line`}>
        {projects.map((p) => editing === p.id ? (
          <div key={p.id} className="p-4"><ProjectForm initial={p} onCancel={() => setEditing(undefined)} onSave={(x) => save(x, p.id)} /></div>
        ) : (
          <div key={p.id} className="flex items-center gap-3 px-5 py-4">
            <Dot color={p.color} size={14} />
            <span className="min-w-0 flex-1">
              <b className="flex items-center gap-2 text-[15px]">{p.name}{p.is_default && <span className="rounded-full border border-card-line px-2 py-0.5 text-[11px] font-semibold text-soft">Standard</span>}</b>
              <span className="block truncate text-[13px] text-muted">{count(p.id)} Dokumente{p.description ? ` · ${p.description}` : ""}</span>
            </span>
            <span className="hidden items-center gap-2 text-[12px] text-soft sm:flex">Für alle Apps <Switch on={p.all_apps} onChange={(v) => void save({ all_apps: v }, p.id)} label={`${p.name} für alle Apps`} /></span>
            <button type="button" onClick={() => setEditing(p.id)} aria-label="Bearbeiten" className={ICON_BTN}><Pencil size={16} /></button>
            {!p.is_default && <button type="button" onClick={() => void remove(p)} aria-label="Löschen" className={`${ICON_BTN} hover:text-negative-text`}><Trash2 size={16} /></button>}
          </div>
        ))}
      </section>
    </>
  );
}

function ProjectForm({ initial, onSave, onCancel }: { initial?: Project; onSave: (p: Partial<Project>) => Promise<void> | void; onCancel: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [color, setColor] = useState(initial?.color ?? PROJECT_COLORS[1]);
  const [allApps, setAllApps] = useState(initial?.all_apps ?? false);
  const [busy, setBusy] = useState(false);
  return (
    <form className={initial ? "space-y-3" : `${CARD} space-y-3 p-5`} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onSave({ name: name.trim(), description: description.trim() || null, color, all_apps: allApps }); setBusy(false); }}>
      <input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, z. B. Steuer 2026" className={field} autoFocus />
      <input maxLength={300} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Beschreibung (optional)" className={field} />
      <div className="flex flex-wrap items-center gap-2">
        {PROJECT_COLORS.map((c) => <button key={c} type="button" onClick={() => setColor(c)} aria-label={`Farbe ${c}`} className="grid h-8 w-8 place-items-center rounded-full" style={{ background: c }}>{color === c && <Check size={15} className="text-white" />}</button>)}
      </div>
      <label className="flex items-center justify-between gap-3 text-[14px]"><span><b>Für alle Apps</b><span className="block text-[12px] text-muted">Allgemeine Daten – jede verbundene App darf lesen</span></span><Switch on={allApps} onChange={setAllApps} label="Für alle Apps" /></label>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || !name.trim()} className="inline-flex h-11 items-center gap-2 rounded-full bg-fg px-5 text-[14px] font-semibold text-canvas disabled:opacity-50">{busy && <Loader2 size={16} className="animate-spin" />} Speichern</button>
        <button type="button" onClick={onCancel} className="h-11 rounded-full px-4 text-[14px] font-semibold text-soft hover:bg-surface-2">Abbrechen</button>
      </div>
    </form>
  );
}
