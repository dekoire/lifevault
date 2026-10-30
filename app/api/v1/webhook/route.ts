import { ApiError, credential, fail, ok, setWebhook } from "@/lib/api";

/**
 * Stups bei Änderungen: PUT { url, secret } hinterlegt eine https-Adresse. Ändert sich ein Dokument, schickt Lifevault
 * höchstens einmal pro Minute POST {"event": "documents.changed"} dorthin – ohne Inhalt, signiert:
 * X-Lifevault-Signature: t=<unix>,v1=hex(HMAC-SHA256(secret, "<unix>.<body>")). Danach holt die App /api/v1/documents/changes.
 * DELETE entfernt die Adresse.
 */
export async function PUT(req: Request) {
  try {
    const b = (await req.json().catch(() => null)) as { url?: unknown; secret?: unknown } | null;
    if (!b || typeof b.url !== "string" || typeof b.secret !== "string") throw new ApiError(400, "invalid_request", "url und secret angeben.");
    return ok(await setWebhook(credential(req), b.url, b.secret));
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  try {
    return ok(await setWebhook(credential(req), null, null));
  } catch (e) {
    return fail(e);
  }
}
