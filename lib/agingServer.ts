import type { SupabaseClient } from "@supabase/supabase-js";
import { agingVerdicts, FORMER_EMPLOYER, type AgingDoc } from "@/lib/aging";

const COLS = "id,title,doc_type,sender,cluster,doc_date,received_at,archived,archived_reason,archive_manual,deadlines,partner_role,basis_id,importance,importance_reason,importance_manual";

/** Alterungsregeln (lib/aging.ts) für einen Nutzer anwenden: archivieren mit Grund, Wichtigkeit deckeln (nicht bei eigener) */
export async function applyAging(sb: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await sb.from("documents").select(COLS).eq("user_id", userId).eq("status", "ready").is("merged_into", null).limit(5000);
  if (error || !data) return 0;
  const docs = data as (AgingDoc & { importance_manual: boolean; archived_reason: string | null; importance_reason: string | null })[];
  const verdicts = agingVerdicts(docs);
  let n = 0;
  // Korrektur: von der Arbeitgeber-Regel archiviert, die Regel trifft aber nicht mehr zu (z. B. Tarifvertrag der
  // Gewerkschaft) → zurückholen; die gedeckelte Wichtigkeit wird neu bewertet
  const byRule = (d: (typeof docs)[number]) => d.archived && !d.archive_manual && d.archived_reason === FORMER_EMPLOYER;
  const recheck = agingVerdicts(docs.map((d) => (byRule(d) ? { ...d, archived: false } : d)));
  for (const d of docs) {
    if (!byRule(d) || recheck.get(d.id)?.reason === FORMER_EMPLOYER) continue;
    const patch: Record<string, unknown> = { archived: false, archived_reason: null };
    if (!d.importance_manual && d.importance_reason === FORMER_EMPLOYER) Object.assign(patch, { importance: null, importance_reason: null });
    const { error: e } = await sb.from("documents").update(patch).eq("id", d.id).eq("user_id", userId);
    if (!e) n++;
  }
  for (const d of docs) {
    const v = verdicts.get(d.id);
    if (!v) continue;
    const patch: Record<string, unknown> = { archived: true, archived_reason: v.reason };
    if (!d.importance_manual && (d.importance ?? 5) > v.cap) Object.assign(patch, { importance: v.cap, importance_reason: v.reason });
    const { error: e } = await sb.from("documents").update(patch).eq("id", d.id).eq("user_id", userId);
    if (!e) n++;
  }
  return n;
}
