// 폭싹 서비스 워커: 푸시 알림 받기·누르면 해당 화면 열기. (화면 캐시는 하지 않아 항상 최신 내용)
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "폭싹";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-64.png",
    tag: data.url || "pokssak",
    data: { url: data.url || "/notifications" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const same = all.find((c) => c.url === url) || all.find((c) => new URL(c.url).origin === self.location.origin);
    if (same) { await same.focus(); if (same.url !== url && "navigate" in same) await same.navigate(url); return; }
    await self.clients.openWindow(url);
  })());
});
