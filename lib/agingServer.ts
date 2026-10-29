import type { SupabaseClient } from "@supabase/supabase-js";
import { agingVerdicts, type AgingDoc } from "@/lib/aging";

const COLS = "id,title,doc_type,sender,cluster,doc_date,received_at,archived,archive_manual,deadlines,partner_role,basis_id,importance,importance_manual";

/** Alterungsregeln (lib/aging.ts) für einen Nutzer anwenden: archivieren mit Grund, Wichtigkeit deckeln (nicht bei eigener) */
export async function applyAging(sb: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await sb.from("documents").select(COLS).eq("user_id", userId).eq("status", "ready").is("merged_into", null).limit(5000);
  if (error || !data) return 0;
  const docs = data as (AgingDoc & { importance_manual: boolean })[];
  const verdicts = agingVerdicts(docs);
  let n = 0;
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
