import { credential, fail, getFile } from "@/lib/api";

/** Original-Datei (PDF/Bild) eines freigegebenen Dokuments */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const f = await getFile(credential(req), (await params).id);
    return new Response(f.data as BodyInit, { headers: {
      "Content-Type": f.mime, "Content-Length": String(f.data.length), "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,
    } });
  } catch (e) {
    return fail(e);
  }
}
