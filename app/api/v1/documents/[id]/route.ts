import { credential, fail, getDocument, ok } from "@/lib/api";

/** Ein Dokument mit allen freigegebenen Angaben (Volltext nur mit Freigabe) */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return ok(await getDocument(credential(req), (await params).id)); } catch (e) { return fail(e); }
}
