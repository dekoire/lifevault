import { loadAiSettings } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";
import { triageMails, type In } from "@/lib/triage";

export const maxDuration = 120;

/** Günstige Vorprüfung: welche Mails/Anhänge gehören in den Tresor (siehe lib/triage.ts) */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  return triageMails((await req.json().catch(() => null)) as { items?: In[] } | null);
}
