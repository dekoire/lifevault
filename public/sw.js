/*
 * Service Worker der App – nur für Push-Mitteilungen (kein Offline-Cache).
 * Der Server schickt { title, body, tag, url }; ein Tipp auf die Mitteilung öffnet die App an der passenden Stelle.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Lifevault", body: event.data ? event.data.text() : "" };
  }
  const base = self.registration.scope;
  event.waitUntil(
    self.registration.showNotification(data.title || "Lifevault", {
      body: data.body || "",
      tag: data.tag || undefined,
      icon: `${base}icon-192.png`,
      badge: `${base}icon-192.png`,
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = String(event.notification.data?.url || "/").replace(/^\//, "");
  const target = new URL(path, self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) {
        if ("focus" in w) {
          await w.focus();
          if ("navigate" in w) await w.navigate(target).catch(() => undefined);
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
