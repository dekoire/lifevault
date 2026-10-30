import { changes, credential, fail, ok } from "@/lib/api";

/**
 * Nur, was sich geändert hat: ?cursor=<Lesemarke aus der letzten Antwort>&limit=1..200.
 * Antwort: { documents, removed, cursor, more } – mit `more: true` gleich mit dem neuen cursor weiterfragen.
 * Ohne cursor kommt alles von Anfang an (erster Abruf). Die Lesemarke hält die App.
 */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    return ok(await changes(credential(req), u.get("cursor"), Number(u.get("limit") ?? 100)));
  } catch (e) {
    return fail(e);
  }
}
