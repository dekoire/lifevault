"use client";
import { CARD } from "@/components/ui";
import { KINDS } from "@/lib/kinds";

/**
 * Anleitung für Entwickler: eine App mit „Mit Lifevault verbinden“ anbinden – App registrieren, Nutzer verbinden
 * (OAuth 2.1 mit PKCE), Token erneuern und widerrufen, Dokumente lesen, nur Änderungen holen und den Stups empfangen.
 * Steht in den Einstellungen unter „Schnittstelle“, unter „Eigene App anbinden“.
 */
export function ConnectDocs() {
  const base = typeof location !== "undefined" ? location.origin : "https://…";
  const code = "block overflow-x-auto whitespace-pre rounded-xl bg-[#14121f] p-3.5 text-[12px] leading-5 text-[#e9e6ff]";
  const h = "pt-2 text-[14px] font-semibold text-fg";
  return (
    <details className={`${CARD} p-5`}>
      <summary className="cursor-pointer text-[15px] font-semibold">Anleitung: App mit Lifevault verbinden</summary>
      <div className="mt-4 space-y-3 text-[13px] leading-6 text-soft">
        <p>
          So bindest du eine eigene App an, wie es Finastry tut. Der Nutzer meldet sich dabei nur bei Lifevault an und entscheidet dort, was die App sehen darf. Deine App sieht nie sein Passwort. Dokumente im Tresor bleiben für Apps immer unsichtbar.
        </p>

        <h3 className={h}>1. App registrieren</h3>
        <p>
          Weiter oben unter „Eigene App anbinden“ einmal anlegen: Name, Webseite und Rückleitungs-Adresse, z. B. <code>https://deine-app.de/api/lifevault/callback</code>. Du bekommst eine Client-ID (<code>lva_…</code>) und ein Geheimnis. Das Geheimnis gehört nur auf den Server deiner App, nie in die App selbst.
        </p>

        <h3 className={h}>2. Nutzer zur Freigabe schicken</h3>
        <p>Dein Server erzeugt einen zufälligen <code>state</code> und einen PKCE-<code>code_verifier</code> und merkt sich beide. Dann leitet er den Nutzer weiter:</p>
        <code className={code}>{`${base}/connect
  ?response_type=code
  &client_id=lva_…
  &redirect_uri=https://deine-app.de/api/lifevault/callback
  &state=<zufällig>
  &code_challenge=<base64url(sha256(code_verifier))>
  &code_challenge_method=S256
  &scope=read write kinds:rechnung,mahnung,vertrag project:DeineApp`}</code>
        <p>
          <b>scope:</b> <code>read</code> heißt lesen, <code>write</code> heißt ablegen, <code>kinds:</code> beschränkt auf bestimmte Dokumentarten, <code>project:</code> legt ein eigenes Projekt für Uploads an. Der Nutzer sieht das und kann es einschränken. Mögliche Arten: {KINDS.map((k) => k.id).join(", ")}.
        </p>
        <p>Nach der Freigabe kommt der Nutzer zurück zu <code>redirect_uri?code=…&amp;state=…</code>, bei Ablehnung mit <code>?error=access_denied</code>. Prüfe, dass <code>state</code> deiner ist.</p>

        <h3 className={h}>3. Code gegen Token tauschen</h3>
        <code className={code}>{`curl -X POST ${base}/api/v1/oauth/token \\
  -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d grant_type=authorization_code \\
  -d code=<code> \\
  -d code_verifier=<code_verifier> \\
  -d redirect_uri=https://deine-app.de/api/lifevault/callback`}</code>
        <p>
          Antwort: <code>access_token</code> (<code>lvt_…</code>, gilt 1 Stunde), <code>refresh_token</code> und <code>expires_in</code>. Beide Tokens verschlüsselt auf deinem Server speichern.
        </p>

        <h3 className={h}>4. Token erneuern und Verbindung trennen</h3>
        <code className={code}>{`curl -X POST ${base}/api/v1/oauth/token -u "$CLIENT_ID:$CLIENT_SECRET" \\
  -d grant_type=refresh_token -d refresh_token=<refresh_token>

curl -X POST ${base}/api/v1/oauth/revoke -u "$CLIENT_ID:$CLIENT_SECRET" -d token=<refresh_token>`}</code>
        <p>
          Jedes Erneuerungstoken gilt nur einmal, die Antwort bringt ein neues Paar. Wird ein altes Erneuerungstoken ein zweites Mal benutzt, wertet Lifevault das als Diebstahl und trennt die Verbindung. Erneuere deshalb nie zweimal gleichzeitig, sondern sperre das Erneuern auf deinem Server.
        </p>

        <h3 className={h}>5. Dokumente lesen und ablegen</h3>
        <p>Alle Aufrufe mit <code>Authorization: Bearer &lt;access_token&gt;</code>:</p>
        <code className={code}>{`GET  ${base}/api/v1/me                          # Rechte, Arten, Projekte
GET  ${base}/api/v1/documents?kinds=rechnung,mahnung&since=2026-01-01
GET  ${base}/api/v1/documents/<id>
GET  ${base}/api/v1/documents/<id>/file         # Original-Datei
POST ${base}/api/v1/documents                   # multipart: file (PDF, Bild, Text)`}</code>
        <p>Jedes Dokument kommt mit Art (<code>kind</code>), Absender, Datum, Zusammenfassung, Beträgen (<code>amounts</code>), Fristen (<code>deadlines</code>) und Eckdaten (<code>key_facts</code>). Personenbezogene Angaben nur, wenn der Nutzer sie freigegeben hat.</p>

        <h3 className={h}>6. Nur Änderungen holen</h3>
        <p>
          Statt jedes Mal alles zu laden, holt deine App nur, was sich seit dem letzten Mal geändert hat. Die Lesemarke (<code>cursor</code>) speicherst du je Nutzer bei dir. Beim ersten Mal ohne <code>cursor</code> kommt alles.
        </p>
        <code className={code}>{`GET ${base}/api/v1/documents/changes?cursor=<lesemarke>&limit=200

→ { "documents": [ … neu oder geändert … ],
    "removed":   [ "<id>", … ],   // gelöscht, archiviert oder nicht mehr freigegeben
    "cursor":    "<neue lesemarke>",
    "more":      true }           // true: gleich mit dem neuen cursor weiterfragen`}</code>
        <code className={code}>{`let cursor = store.cursor            // null beim ersten Mal
do {
  const r = await get(\`/api/v1/documents/changes?cursor=\${cursor ?? ""}\`)
  r.removed.forEach((id) => store.delete(id))
  r.documents.forEach((d) => store.put(d))    // gleiche ID = ersetzen
  cursor = r.cursor
} while (r.more)
store.cursor = cursor                // erst speichern, wenn alles verarbeitet ist`}</code>
        <p>Geht unterwegs etwas schief, fängst du einfach wieder bei der alten Lesemarke an. Es geht nichts verloren, und doppelt Geholtes wird ersetzt.</p>

        <h3 className={h}>7. Angestupst werden</h3>
        <p>Damit deine App sofort Bescheid weiß, hinterlegt sie eine https-Adresse und ein Geheimnis (32 bis 200 Zeichen):</p>
        <code className={code}>{`curl -X PUT ${base}/api/v1/webhook \\
  -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \\
  -d '{"url":"https://deine-app.de/api/lifevault/ping?h=<deine-kennung>","secret":"<geheimnis>"}'`}</code>
        <p>
          Ändert sich ein Dokument des Nutzers, schickt Lifevault höchstens einmal pro Minute ein POST an diese Adresse. Es enthält keine Dokumente, nur <code>{`{"event": "documents.changed"}`}</code>. Deine App holt danach die Änderungen wie in Schritt 6. Prüfe immer die Signatur:
        </p>
        <code className={code}>{`// Header: X-Lifevault-Signature: t=<unix-zeit>,v1=<hex>
const [, t, v1] = /^t=(\\d+),v1=([0-9a-f]{64})$/.exec(header) ?? []
const want = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest()
const ok = t && Math.abs(Date.now() / 1000 - Number(t)) < 600
  && crypto.timingSafeEqual(Buffer.from(v1, "hex"), want)`}</code>
        <p>Signiert wird der Text des Inhalts genau so, wie er ankommt. Erlaubt sind nur https-Adressen mit Domain, keine IP-Adressen und keine internen Rechner. <code>DELETE /api/v1/webhook</code> entfernt die Adresse.</p>

        <h3 className={h}>Grenzen</h3>
        <p>120 Anfragen pro Minute, 60 Uploads pro Stunde, Dateien bis 4 MB. Der Nutzer kann die Verbindung jederzeit in Lifevault unter Einstellungen › API &amp; MCP trennen. Danach antwortet die Schnittstelle mit 401, und deine App sollte „neu verbinden“ anbieten.</p>
      </div>
    </details>
  );
}
