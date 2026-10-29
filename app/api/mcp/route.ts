import { ApiError, credential, getDocument, rpc, search, uploadDocument, type SearchArgs } from "@/lib/api";
import { CLUSTER_IDS } from "@/lib/clusters";

export const maxDuration = 300;

/**
 * MCP-Server (Streamable HTTP, zustandslos, Antworten als JSON).
 * Anmeldung wie bei der REST-API: Authorization: Bearer <client_id>:<client_secret> oder ein Token aus /api/v1/token.
 */
const VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

const TOOLS = [
  { name: "whoami", description: "Zeigt, welche App verbunden ist, welche Rechte sie hat und welche Projekte sie sehen darf.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  { name: "list_projects", description: "Listet die freigegebenen Projekte mit Anzahl der Dokumente.", inputSchema: { type: "object", properties: {} }, annotations: { readOnlyHint: true } },
  {
    name: "search_documents",
    description: "Sucht Dokumente (Titel, Absender, Art, Zusammenfassung, Schlagworte; mit Volltext-Freigabe auch im Text). Liefert Metadaten, Zusammenfassung, Fakten (ggf. ohne personenbezogene), Fristen und Beträge.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Suchbegriff, z. B. „Telekom“ oder „Arbeitsvertrag“" },
        project_id: { type: "string" },
        cluster: { type: "string", enum: [...CLUSTER_IDS] },
        since: { type: "string", description: "YYYY-MM-DD (Dokumentdatum ab)" },
        until: { type: "string", description: "YYYY-MM-DD (Dokumentdatum bis)" },
        include_archived: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 100 },
        offset: { type: "integer", minimum: 0 },
      },
    },
    annotations: { readOnlyHint: true },
  },
  { name: "get_document", description: "Holt ein Dokument mit allen freigegebenen Angaben (Volltext nur mit Freigabe).", inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }, annotations: { readOnlyHint: true } },
  {
    name: "upload_document",
    description: "Legt ein Dokument ab und lässt es sofort auslesen. Entweder „text“ (Notiz, E-Mail-Text) oder „content_base64“ mit mime_type (application/pdf, image/jpeg, image/png, image/webp). Benötigt Schreibrecht.",
    inputSchema: {
      type: "object",
      properties: {
        file_name: { type: "string" },
        mime_type: { type: "string" },
        content_base64: { type: "string" },
        text: { type: "string" },
        project_id: { type: "string" },
      },
      required: ["file_name"],
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
];

type Msg = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

const reply = (id: Msg["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const error = (id: Msg["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

async function callTool(cred: string, name: string, args: Record<string, unknown>) {
  switch (name) {
    case "whoami": return rpc("api_whoami", { p_cred: cred });
    case "list_projects": return rpc("api_list_projects", { p_cred: cred });
    case "search_documents": return search(cred, args as SearchArgs);
    case "get_document": return getDocument(cred, String(args.id ?? ""));
    case "upload_document": {
      const text = typeof args.text === "string" ? args.text : undefined;
      const b64 = typeof args.content_base64 === "string" ? args.content_base64 : undefined;
      if (!text && !b64) throw new ApiError(400, "bad_request", "„text“ oder „content_base64“ fehlt.");
      return uploadDocument(cred, {
        fileName: String(args.file_name ?? "upload"),
        mimeType: text ? "text/plain" : String(args.mime_type ?? ""),
        data: text ? new TextEncoder().encode(text) : Uint8Array.from(Buffer.from(b64!, "base64")),
        projectId: typeof args.project_id === "string" ? args.project_id : null,
      });
    }
    default: throw new ApiError(404, "unknown_tool", `Unbekanntes Werkzeug: ${name}`);
  }
}

async function handle(cred: string, m: Msg) {
  switch (m.method) {
    case "initialize": {
      const asked = String(m.params?.protocolVersion ?? "");
      return reply(m.id, {
        protocolVersion: VERSIONS.includes(asked) ? asked : VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "lifevault", version: "0.1.0" },
        instructions: "Lifevault ist ein persönlicher Dokumenten-Tresor. Nutze search_documents und get_document, um Fragen zu Verträgen, Rechnungen, Gehalt usw. zu beantworten. Personenbezogene Angaben und Volltext sind je nach Freigabe ausgeblendet. Mit upload_document legst du neue Dokumente ab.",
      });
    }
    case "ping": return reply(m.id, {});
    case "tools/list": return reply(m.id, { tools: TOOLS });
    case "tools/call": {
      const name = String(m.params?.name ?? "");
      try {
        const out = await callTool(cred, name, (m.params?.arguments as Record<string, unknown>) ?? {});
        return reply(m.id, { content: [{ type: "text", text: JSON.stringify(out, null, 1) }], structuredContent: Array.isArray(out) ? { items: out } : out, isError: false });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) throw e;
        const msg = e instanceof ApiError ? e.message : "Interner Fehler.";
        return reply(m.id, { content: [{ type: "text", text: msg }], isError: true });
      }
    }
    default: return error(m.id, -32601, `Methode nicht unterstützt: ${m.method}`);
  }
}

export async function POST(req: Request) {
  let cred: string;
  try {
    cred = credential(req);
    // Zugang gleich prüfen, damit MCP-Clients sauber 401 bekommen
    await rpc("api_whoami", { p_cred: cred });
  } catch (e) {
    const status = e instanceof ApiError ? e.status : 401;
    return Response.json(error(null, -32001, e instanceof ApiError ? e.message : "Nicht angemeldet."), { status, headers: { "WWW-Authenticate": 'Bearer realm="lifevault"', "Cache-Control": "no-store" } });
  }
  const body = (await req.json().catch(() => undefined)) as Msg | Msg[] | undefined;
  if (!body) return Response.json(error(null, -32700, "Ungültiges JSON."), { status: 400 });
  const list = Array.isArray(body) ? body : [body];
  const out = [];
  for (const m of list) {
    if (m.id === undefined || m.id === null) continue; // Benachrichtigungen brauchen keine Antwort
    try { out.push(await handle(cred, m)); } catch (e) { out.push(error(m.id, -32001, (e as Error).message)); }
  }
  if (!out.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? out : out[0], { headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  return new Response("Dieser MCP-Server antwortet nur auf POST (zustandslos).", { status: 405, headers: { Allow: "POST" } });
}
