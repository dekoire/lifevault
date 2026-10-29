import { credential, fail, ok, rpc } from "@/lib/api";

/** Welche App bin ich, welche Rechte und Projekte habe ich? */
export async function GET(req: Request) {
  try { return ok(await rpc("api_whoami", { p_cred: credential(req) })); } catch (e) { return fail(e); }
}
