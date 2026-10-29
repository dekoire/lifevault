import { applyAging } from "@/lib/agingServer";
import { unauthorized, userClient } from "@/lib/server";

/** Alterungsregeln für den angemeldeten Nutzer anwenden (lib/aging.ts) – ohne KI, schnell */
export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  return Response.json({ archived: await applyAging(auth.sb, auth.user.id) });
}
