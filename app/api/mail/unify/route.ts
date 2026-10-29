import { loadAiSettings } from "@/lib/ai";
import { unauthorized, userClient } from "@/lib/server";
import { unifyMailDocs } from "@/lib/unify";

export const maxDuration = 60;

/** Anhänge einer Mail unter einen Partner legen (siehe lib/unify.ts) */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  await loadAiSettings(auth.sb);
  return unifyMailDocs(auth.sb, auth.user.id, (await req.json().catch(() => ({}))) as { ids?: unknown; subject?: unknown; from?: unknown });
}
