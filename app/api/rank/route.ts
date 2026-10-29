import { loadAiSettings } from "@/lib/ai";
import { loadGroups, rankDocs } from "@/lib/rank";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 120;

/** Wichtigkeit und Zusammenhang für noch unbewertete Dokumente nachholen – je Aufruf bis zu 3 Partner bzw. 30 Dokumente ohne Absender */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  const groups = await loadGroups(auth.sb);
  const open = [...groups.entries()].filter(([, g]) => g.some((d) => d.importance === null));
  if (!open.length) return Response.json({ done: 0, left: 0 });
  let done = 0;
  // Partner mit den meisten unbewerteten Dokumenten zuerst
  open.sort((a, b) => b[1].filter((d) => d.importance === null).length - a[1].filter((d) => d.importance === null).length);
  for (const [key, group] of open.slice(0, 3)) {
    // ganzer Partner: auch Bewertete bekommen so ihren Bezug zur (vielleicht neuen) Grundlage
    const targets = (key ? group : group.filter((d) => d.importance === null)).slice(0, key ? 60 : 30);
    done += await rankDocs(auth.sb, targets, group, !!key);
  }
  const { count } = await auth.sb.from("documents").select("id", { count: "exact", head: true }).eq("status", "ready").is("merged_into", null).is("importance", null);
  return Response.json({ done, left: count ?? 0 });
}
