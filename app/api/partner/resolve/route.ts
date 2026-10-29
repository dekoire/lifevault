import { generateText } from "ai";
import { aiFor, loadAiSettings } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";

export const maxDuration = 60;

/**
 * Neuer Partnername prüfen: offizieller Name, Webadresse (für das Logo) und welche anderen Partner dieselbe Firma sind.
 * Nur Namen gehen an die KI – keine Dokumentinhalte.
 */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; old?: unknown; others?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 200) : "";
  if (!name) return Response.json({ error: "Name fehlt." }, { status: 400 });
  const old = typeof body.old === "string" ? body.old.slice(0, 200) : "";
  const others = Array.isArray(body.others) ? body.others.filter((x): x is string => typeof x === "string").slice(0, 200).map((x) => x.slice(0, 120)) : [];
  try {
    const r = await generateText({
      ...aiFor("classify"),
      system: `Du prüfst Firmennamen für ein Dokumentenarchiv in Deutschland. Der Nutzer hat einen Partner umbenannt.
Gib zurück: den gebräuchlichen, korrekt geschriebenen Namen der Firma/Stelle (kurz, ohne Rechtsform, z. B. „John Reed Fitness“, „Klinikum Stuttgart“), ihre offizielle Webadresse (nur Domain, z. B. johnreed.fitness) oder null, wenn unsicher,
und die Nummern der anderen Partner aus der Liste, die sicher DIESELBE Firma/Stelle sind (Schreibvarianten, Abkürzungen, Marke ↔ Betreiber wie „RSG Group“ ↔ „John Reed“). Im Zweifel nicht aufnehmen.
Antworte NUR mit JSON: {"name":"…","domain":"…" oder null,"same":[Nummern]}`,
      prompt: `Neuer Name: ${name}\nBisheriger Name: ${old}\nAndere Partner:\n${others.map((o, i) => `${i}: ${o}`).join("\n")}`,
      maxOutputTokens: 400,
    });
    const j = JSON.parse(r.text.slice(r.text.indexOf("{"), r.text.lastIndexOf("}") + 1) || "{}") as { name?: unknown; domain?: unknown; same?: unknown };
    const domain = typeof j.domain === "string" ? j.domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : null;
    return Response.json({
      name: typeof j.name === "string" && j.name.trim() ? j.name.trim().slice(0, 200) : name,
      domain: domain && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) ? domain : null,
      same: Array.isArray(j.same) ? j.same.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < others.length).map((n) => others[n]) : [],
    });
  } catch (e) {
    console.error("partner resolve", (e as Error).message);
    return Response.json({ name, domain: null, same: [] });
  }
}
