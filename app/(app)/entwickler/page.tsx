"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { BackLink, CARD, PageHeader } from "@/components/ui";

/**
 * Anleitung für Entwickler (nur angemeldet): eine eigene App an Lifevault anbinden – „Mit Lifevault verbinden“
 * (OAuth 2.1 + PKCE) für viele Nutzer, fester Zugang für eigene Skripte, REST-API, Webhooks und MCP.
 * Beispiele zeigen die Adresse, unter der die Seite gerade läuft.
 */
function Code({ children }: { children: string }) {
  const [done, setDone] = useState(false);
  return (
    <div className="relative mt-2">
      <pre className="overflow-x-auto rounded-xl bg-surface-2 p-3 pr-12 text-[12.5px] leading-5"><code>{children}</code></pre>
      <button type="button" aria-label="Kopieren" onClick={() => { void navigator.clipboard.writeText(children); setDone(true); setTimeout(() => setDone(false), 1400); }} className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full bg-surface text-muted hover:text-fg">
        {done ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

function Step({ n, title, children }: { n?: number; title: string; children: React.ReactNode }) {
  return (
    <section className={`${CARD} p-5`}>
      <h2 className="flex items-center gap-2.5 text-[16px] font-semibold">
        {n !== undefined && <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-500 text-[13px] text-white">{n}</span>}
        {title}
      </h2>
      <div className="mt-2 space-y-2 text-[14px] leading-6 text-soft">{children}</div>
    </section>
  );
}

const C = ({ children }: { children: React.ReactNode }) => <code className="rounded bg-surface-2 px-1 py-0.5 text-[12.5px] text-fg">{children}</code>;

export default function DeveloperPage() {
  const [base, setBase] = useState("https://lifevault.example");
  useEffect(() => setBase(window.location.origin), []);

  return (
    <>
      <BackLink href="/einstellungen/api" label="API & MCP" />
      <PageHeader title="Für Entwickler" subtitle="Eine eigene App an Lifevault anbinden – pro Nutzer freigegeben, mit genau den Rechten, die er erlaubt" />
      <div className="max-w-3xl space-y-4">
        <Step title="Zwei Wege">
          <p><b className="text-fg">App für viele Nutzer</b> (z. B. Finastry): „Mit Lifevault verbinden“ nach OAuth 2.1 mit PKCE. Jeder Nutzer meldet sich bei Lifevault an, sieht, was die App will, und gibt nur frei, was er möchte. Deine App sieht nie sein Passwort und bekommt pro Nutzer eigene Schlüssel. Weiter mit Schritt 1.</p>
          <p><b className="text-fg">Eigener Zugang</b> für deine Skripte, Automationen oder KI-Werkzeuge (nur dein Konto): unter <Link href="/einstellungen/api" className="font-semibold text-brand-500">API & MCP</Link> einen Zugang anlegen, Rechte wählen, mit Client-ID und Geheimnis ein Token holen (unten „Fester Zugang“).</p>
          <p>Selbstbeschreibung für Bibliotheken (RFC 8414):</p>
          <Code>{`${base}/.well-known/oauth-authorization-server`}</Code>
        </Step>

        <Step n={1} title="App einmal registrieren">
          <p>Unter <Link href="/einstellungen/api" className="font-semibold text-brand-500">Einstellungen › API & MCP › Eigene App anbinden</Link>: Name, Beschreibung, Webseite und Rückleitungs-Adresse(n) eintragen. Du bekommst eine <b className="text-fg">Client-ID</b> und ein <b className="text-fg">Geheimnis</b>.</p>
          <p>Das Geheimnis wird nur einmal angezeigt und gehört ausschließlich auf den Server deiner App (Umgebungsvariable) – nie in den Browser, eine App-Datei oder ein Repository. Geht es verloren oder wurde es bekannt: dort „Neues Geheimnis“.</p>
        </Step>

        <Step n={2} title="Nutzer zur Freigabe schicken">
          <p>Erzeuge pro Anmeldung einen zufälligen <C>code_verifier</C> (43–128 Zeichen) und einen <C>state</C>, merke beide auf deinem Server und leite den Nutzer weiter:</p>
          <Code>{`${base}/connect
  ?response_type=code
  &client_id=DEINE_CLIENT_ID
  &redirect_uri=https://deine-app.de/api/lifevault/callback
  &state=ZUFALL
  &code_challenge=BASE64URL(SHA256(code_verifier))
  &code_challenge_method=S256
  &scope=read write kinds:rechnung,vertrag project:DeineApp`}</Code>
          <p>Der Nutzer meldet sich an (oder registriert sich), sieht deine Anfrage und kann sie einschränken. Danach kommt er zurück an deine <C>redirect_uri</C> mit <C>?code=…&state=…</C>. Prüfe, dass <C>state</C> zu deinem passt. Der Code gilt 5 Minuten und nur einmal.</p>
        </Step>

        <Step n={3} title="Code gegen Token tauschen (nur auf dem Server)">
          <Code>{`curl -X POST ${base}/api/v1/oauth/token \\
  -u "DEINE_CLIENT_ID:DEIN_GEHEIMNIS" \\
  -d grant_type=authorization_code \\
  -d code=CODE_AUS_DER_RÜCKLEITUNG \\
  -d code_verifier=DEIN_CODE_VERIFIER \\
  -d redirect_uri=https://deine-app.de/api/lifevault/callback`}</Code>
          <p>Antwort:</p>
          <Code>{`{ "access_token": "…", "token_type": "Bearer", "expires_in": 3600, "refresh_token": "…" }`}</Code>
          <p>Speichere beide Token pro Nutzer verschlüsselt. Das Zugriffstoken gilt 1 Stunde, das Erneuerungstoken 90 Tage und wird bei jeder Nutzung ersetzt.</p>
        </Step>

        <Step n={4} title="API aufrufen">
          <p>Jede Anfrage mit <C>Authorization: Bearer ACCESS_TOKEN</C>:</p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <tbody className="divide-y divide-line">
                {([
                  ["GET /api/v1/me", "Welche App, welche Rechte, welche Projekte"],
                  ["GET /api/v1/projects", "Freigegebene Projekte"],
                  ["GET /api/v1/documents", "Suchen/auflisten: ?q=&project_id=&cluster=&kinds=rechnung,mahnung&since=&until=&include_archived=&limit=&offset="],
                  ["GET /api/v1/documents/{id}", "Ein Dokument mit allen freigegebenen Angaben (Volltext nur mit Freigabe)"],
                  ["GET /api/v1/documents/{id}/file", "Original-Datei (PDF/Bild)"],
                  ["GET /api/v1/documents/changes", "Nur Änderungen seit der letzten Lesemarke: ?cursor=&limit=1..200 → { documents, removed, cursor, more }"],
                  ["POST /api/v1/documents", "Hochladen und auslesen (Recht „write“): multipart file (+ project_id) oder JSON { file_name, mime_type, content_base64 | text }; höchstens 4 MB"],
                ] as const).map(([e, d]) => (
                  <tr key={e}><td className="py-2 pr-3 align-top font-mono text-[12px] whitespace-nowrap text-fg">{e}</td><td className="py-2 align-top">{d}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <Code>{`curl ${base}/api/v1/documents?kinds=rechnung&limit=20 \\
  -H "Authorization: Bearer ACCESS_TOKEN"`}</Code>
          <p>Fehler kommen als JSON mit <C>error</C> und Klartext; bei <C>401</C> Token erneuern, bei <C>429</C> kurz warten.</p>
        </Step>

        <Step n={5} title="Token erneuern und Verbindung trennen">
          <Code>{`curl -X POST ${base}/api/v1/oauth/token \\
  -u "DEINE_CLIENT_ID:DEIN_GEHEIMNIS" \\
  -d grant_type=refresh_token -d refresh_token=REFRESH_TOKEN`}</Code>
          <p>Trennt der Nutzer in deiner App die Verbindung, widerrufe das Token (Antwort immer 200):</p>
          <Code>{`curl -X POST ${base}/api/v1/oauth/revoke \\
  -u "DEINE_CLIENT_ID:DEIN_GEHEIMNIS" -d token=REFRESH_TOKEN`}</Code>
          <p>Trennt der Nutzer in Lifevault, liefert jede Anfrage danach <C>401</C> – dann die gespeicherten Token löschen.</p>
        </Step>

        <Step title="Rechte: pro Nutzer, pro Projekt, pro Dokumentart">
          <p>Mit <C>scope</C> fragst du an, der Nutzer entscheidet – er kann auf der Freigabe-Seite und später unter „API & MCP“ jederzeit einschränken oder trennen:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><C>read</C> / <C>write</C> – lesen bzw. Dokumente hochladen</li>
            <li><C>project:Name</C> – schlägt ein eigenes Projekt für deine App vor (der Nutzer kann andere wählen oder alle freigeben)</li>
            <li><C>kinds:…</C> – nur bestimmte Arten: mahnung, gehalt, medizin, ausweis, angebot, bescheid, formular, bedingungen, rechnung, bestaetigung, vertrag, schreiben</li>
            <li>Bereiche, persönliche Daten, Gesundheitsdaten und Volltext gibt nur der Nutzer frei – nicht anfragbar</li>
          </ul>
          <p>Dokumente im verschlüsselten Tresor sind für Apps nie sichtbar. Jeder Zugriff steht im Protokoll des Nutzers.</p>
        </Step>

        <Step title="Webhooks: Bescheid bei Änderungen">
          <p>Statt ständig abzufragen: Adresse hinterlegen. Ändert sich ein freigegebenes Dokument, schickt Lifevault höchstens einmal pro Minute einen Stups ohne Inhalt; deine App holt dann <C>/api/v1/documents/changes</C>.</p>
          <Code>{`curl -X PUT ${base}/api/v1/webhook \\
  -H "Authorization: Bearer ACCESS_TOKEN" -H "Content-Type: application/json" \\
  -d '{"url":"https://deine-app.de/api/lifevault/ping","secret":"EIGENES_ZUFALLSGEHEIMNIS"}'`}</Code>
          <p>Lifevault sendet <C>{`POST {"event":"documents.changed"}`}</C> mit <C>X-Lifevault-Signature: t=…,v1=…</C>. Prüfen (Node):</p>
          <Code>{`import { createHmac, timingSafeEqual } from "node:crypto";
const [t, v1] = sig.split(",").map((p) => p.split("=")[1]);
const want = createHmac("sha256", SECRET).update(\`\${t}.\${rawBody}\`).digest("hex");
const ok = Math.abs(Date.now() / 1000 - Number(t)) < 300 && timingSafeEqual(Buffer.from(v1), Buffer.from(want));`}</Code>
          <p><C>DELETE /api/v1/webhook</C> entfernt die Adresse.</p>
        </Step>

        <Step title="Fester Zugang (eigene Skripte)">
          <p>Für Zugänge, die du unter <Link href="/einstellungen/api" className="font-semibold text-brand-500">API & MCP</Link> selbst angelegt hast:</p>
          <Code>{`curl -X POST ${base}/api/v1/token \\
  -d grant_type=client_credentials -d client_id=CLIENT_ID -d client_secret=GEHEIMNIS`}</Code>
        </Step>

        <Step title="MCP für KI-Assistenten">
          <p>Lifevault ist auch ein MCP-Server (Streamable HTTP) mit den Werkzeugen whoami, list_projects, search_documents, get_document und upload_document – mit denselben Rechten wie der Zugang:</p>
          <Code>{`${base}/api/mcp
Authorization: Bearer CLIENT_ID:GEHEIMNIS   (oder ein Token aus /api/v1/token)`}</Code>
        </Step>

        <Step title="Checkliste Sicherheit">
          <ul className="list-disc space-y-1 pl-5">
            <li>Geheimnis und Token nur auf dem Server, verschlüsselt gespeichert</li>
            <li>Immer PKCE (S256) und <C>state</C> prüfen; <C>redirect_uri</C> genau wie registriert</li>
            <li>Nur anfragen, was die App wirklich braucht (<C>kinds</C>, kein <C>write</C> ohne Grund)</li>
            <li>Webhook-Signatur und Zeitstempel prüfen; nach <C>401</C> Token löschen</li>
          </ul>
        </Step>
      </div>
    </>
  );
}
