import { credential, fail, ok, rpc } from "@/lib/api";

/** Projekte, auf die diese App zugreifen darf */
export async function GET(req: Request) {
  try { return ok(await rpc("api_list_projects", { p_cred: credential(req) })); } catch (e) { return fail(e); }
}
