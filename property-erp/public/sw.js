/*
 * Service Worker — GSW Property ERP
 * السياسة: لا يتم تخزين أي بيانات مالية أو شخصية مؤقتًا.
 * يُخزَّن فقط: الملفات الثابتة (JS/CSS/الأيقونات) وصفحة "غير متصل".
 * الصفحات والطلبات تذهب دائمًا للشبكة؛ عند الانقطاع تظهر صفحة offline.
 * لا تُرسل أي عملية (POST) دون اتصال، لمنع تسجيل عمليات مالية غير مؤكدة.
 */
const VERSION = "gsw-v1";
const STATIC = ["/offline.html", "/icon.svg", "/icon-192.png", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(STATIC)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // الملفات الثابتة المُجزّأة من Next.js: cache-first
  if (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname)) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // التنقل بين الصفحات: الشبكة دائمًا، وصفحة offline عند الانقطاع
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
  }
});
