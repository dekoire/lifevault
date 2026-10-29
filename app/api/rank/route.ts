import { loadAiSettings } from "@/lib/ai";
import { loadGroups, rankDocs } from "@/lib/rank";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 120;

/**
 * Wichtigkeit und Zusammenhang rückwirkend bewerten, Partner für Partner.
 * Ohne Angaben: nur noch unbewertete (bis zu 3 Partner je Aufruf) – Antwort { done, left }.
 * { all: true, cursor }: alle neu bewerten (von Hand gesetzte Wichtigkeit bleibt) – Antwort { done, next, total }, weiter mit cursor = next bis next = total.
 */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  const body = (await req.json().catch(() => null)) as { all?: unknown; cursor?: unknown } | null;
  const groups = await loadGroups(auth.sb, auth.user.id);
  let done = 0;

  if (body?.all === true) {
    // feste Reihenfolge, damit der Cursor über mehrere Aufrufe stimmt; ohne Absender zuletzt
    const list = [...groups.entries()].sort((a, b) => (a[0] === "" ? 1 : b[0] === "" ? -1 : a[0].localeCompare(b[0])));
    const cursor = Math.max(0, Math.floor(Number(body.cursor) || 0));
    let next = cursor;
    // je Aufruf höchstens ~60 Dokumente, damit es in die Laufzeit passt
    for (let n = 0; next < list.length && (n === 0 || n < 60); next++) {
      const [key, group] = list[next];
      const targets = group.slice(0, key ? 60 : 30);
      if (n && n + targets.length > 60) break;
      n += targets.length;
      done += await rankDocs(auth.sb, targets, group, !!key, auth.user.id);
    }
    return Response.json({ done, next, total: list.length });
  }

  const open = [...groups.entries()].filter(([, g]) => g.some((d) => d.importance === null));
  if (!open.length) return Response.json({ done: 0, left: 0 });
  // Partner mit den meisten unbewerteten Dokumenten zuerst
  open.sort((a, b) => b[1].filter((d) => d.importance === null).length - a[1].filter((d) => d.importance === null).length);
  for (const [key, group] of open.slice(0, 3)) {
    // ganzer Partner: auch Bewertete bekommen so ihren Bezug zur (vielleicht neuen) Grundlage
    const targets = (key ? group : group.filter((d) => d.importance === null)).slice(0, key ? 60 : 30);
    done += await rankDocs(auth.sb, targets, group, !!key, auth.user.id);
  }
  const { count } = await auth.sb.from("documents").select("id", { count: "exact", head: true }).eq("status", "ready").is("merged_into", null).is("importance", null);
  return Response.json({ done, left: count ?? 0 });
}
