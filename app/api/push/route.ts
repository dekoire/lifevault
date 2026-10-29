import { sendPush, vapid } from "@/lib/push";
import { unauthorized, userClient } from "@/lib/server";

/** GET: öffentlicher Schlüssel fürs Anmelden des Geräts. POST {action:"test"}: Test-Mitteilung an die eigenen Geräte. */
export async function GET(req: Request) {
  if (!(await userClient(req))) return unauthorized();
  return Response.json({ publicKey: vapid()?.publicKey ?? null });
}

export async function POST(req: Request) {
  const auth = await userClient(req);
  if (!auth) return unauthorized();
  const body = (await req.json().catch(() => null)) as { action?: string } | null;
  if (body?.action !== "test") return Response.json({ error: "Ungültige Anfrage." }, { status: 400 });
  if (!vapid()) return Response.json({ error: "Mitteilungen sind auf dem Server noch nicht eingerichtet (Schlüssel fehlt)." }, { status: 503 });
  // nur die eigenen Geräte – RLS lässt nichts anderes zu
  const { data: subs } = await auth.sb.from("push_subscriptions").select("endpoint,p256dh,auth");
  let sent = 0;
  for (const s of subs ?? []) {
    const r = await sendPush(s, { title: "Lifevault", body: "So sehen Erinnerungen an Fristen aus. 👋", url: "/", tag: "test" });
    if (r === "ok") sent++;
    if (r === "gone") await auth.sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
  }
  return Response.json({ sent });
}
