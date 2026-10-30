/** Beim Abmelden: Browser soll seinen Zwischenspeicher für diese Seite leeren (Dokument-Ansichten, Vorschaubilder) */
export function POST() {
  return new Response(null, { status: 204, headers: { "Clear-Site-Data": '"cache"', "Cache-Control": "no-store" } });
}
