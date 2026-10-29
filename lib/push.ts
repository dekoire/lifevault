import webpush from "web-push";

/**
 * Web-Push (auch für die Web-App auf dem iPhone-Home-Bildschirm ab iOS 16.4).
 * Schlüssel als Umgebungsvariablen: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:…).
 * Inhalte sind Ende-zu-Ende verschlüsselt – nur das Gerät kann sie lesen.
 */
export function vapid() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return undefined;
  return { publicKey, privateKey, subject: process.env.VAPID_SUBJECT?.trim() || "mailto:support@lifevault.app" };
}

export type PushTarget = { endpoint: string; p256dh: string; auth: string };
export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/** Schickt eine Mitteilung; „gone“, wenn das Abo nicht mehr existiert (404/410) */
export async function sendPush(t: PushTarget, m: PushMessage): Promise<"ok" | "gone" | "error"> {
  const keys = vapid();
  if (!keys) return "error";
  try {
    await webpush.sendNotification({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, JSON.stringify(m), { vapidDetails: keys, TTL: 12 * 3600, urgency: "high" });
    return "ok";
  } catch (e) {
    const code = (e as { statusCode?: number }).statusCode;
    return code === 404 || code === 410 ? "gone" : "error";
  }
}
