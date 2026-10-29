import { ApiError, credential, fail, MAX_UPLOAD, ok, search, uploadDocument } from "@/lib/api";

export const maxDuration = 300;

/** Dokumente suchen/auflisten: ?q=&project_id=&cluster=&since=&until=&include_archived=&limit=&offset= */
export async function GET(req: Request) {
  try {
    const u = new URL(req.url).searchParams;
    return ok(await search(credential(req), {
      query: u.get("q") ?? undefined, project_id: u.get("project_id") ?? undefined, cluster: u.get("cluster") ?? undefined,
      since: u.get("since") ?? undefined, until: u.get("until") ?? undefined, include_archived: u.get("include_archived") === "true",
      limit: Number(u.get("limit") ?? 20), offset: Number(u.get("offset") ?? 0),
    }));
  } catch (e) {
    return fail(e);
  }
}

/**
 * Dokument hochladen und sofort auslesen lassen.
 * multipart/form-data: file, project_id (optional) – oder JSON: { file_name, mime_type, content_base64 | text, project_id }
 */
export async function POST(req: Request) {
  try {
    const cred = credential(req);
    if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD * 1.4) throw new ApiError(413, "too_large", "Datei zu groß.");
    const type = req.headers.get("content-type") ?? "";
    let input: { fileName: string; mimeType: string; data: Uint8Array; projectId?: string | null };
    if (type.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) throw new ApiError(400, "bad_request", "Feld „file“ fehlt.");
      input = { fileName: file.name, mimeType: file.type || "application/octet-stream", data: new Uint8Array(await file.arrayBuffer()), projectId: (form.get("project_id") as string | null) ?? null };
    } else {
      const b = (await req.json().catch(() => null)) as { file_name?: string; mime_type?: string; content_base64?: string; text?: string; project_id?: string } | null;
      if (!b) throw new ApiError(400, "bad_request", "JSON oder multipart/form-data erwartet.");
      const data = typeof b.text === "string" ? new TextEncoder().encode(b.text) : typeof b.content_base64 === "string" ? Uint8Array.from(Buffer.from(b.content_base64, "base64")) : undefined;
      if (!data) throw new ApiError(400, "bad_request", "„text“ oder „content_base64“ fehlt.");
      input = { fileName: b.file_name ?? (b.text ? "notiz.txt" : "upload"), mimeType: b.text ? "text/plain" : b.mime_type ?? "", data, projectId: b.project_id ?? null };
    }
    return ok(await uploadDocument(cred, input), 201);
  } catch (e) {
    return fail(e);
  }
}
