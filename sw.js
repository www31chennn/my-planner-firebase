// ── sw.js ─────────────────────────────────────────────────
// Service Worker：處理推播通知

const CACHE_NAME = "my-planner-v1";

// ── 安裝 ───────────────────────────────────────────────────
self.addEventListener("install", e => {
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(self.clients.claim());
});

// ── 收到推播 ───────────────────────────────────────────────
self.addEventListener("push", e => {
  const data = e.data?.json() || {};
  const title = data.title || "my-planner";
  const body = data.body || "";
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon.png",
      badge: "/icon.png",
    })
  );
});

// ── 點擊通知 ───────────────────────────────────────────────
self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: "window" }).then(clients => {
      if (clients.length > 0) {
        clients[0].focus();
      } else {
        self.clients.openWindow("/");
      }
    })
  );
});

// ── 定時檢查（每天早上 9 點發通知）────────────────────────
self.addEventListener("periodicsync", e => {
  if (e.tag === "check-countdowns") {
    e.waitUntil(checkCountdowns());
  }
});

async function checkCountdowns() {
  // 確認有通知權限才繼續
  if (Notification.permission !== "granted") return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  const cache = await caches.open(CACHE_NAME);

  // 檢查今天是否已經從 SW 發過通知
  const sentRes = await cache.match("/sw-sent-date");
  if (sentRes) {
    const sentDate = await sentRes.text();
    if (sentDate === todayStr) return; // 今天已經發過，不重複發
  }

  // 從 SW 的 cache 讀取倒數日資料
  const sessionRes = await cache.match("/sw-session");
  const itemsRes = await cache.match("/sw-countdown");
  if (!sessionRes || !itemsRes) return;

  const items = await itemsRes.json();
  if (!Array.isArray(items)) return;

  for (const item of items) {
    if (!item.notify) continue;

    const target = new Date(item.date + "T00:00:00");
    let match = false;

    if (item.repeat) {
      match = (target.getMonth() === today.getMonth() && target.getDate() === today.getDate());
    } else {
      match = item.date === todayStr;
    }

    if (match) {
      await self.registration.showNotification("my-planner", {
        body: `今天是 ${item.name}`,
        icon: "/icon.png",
        badge: "/icon.png",
        tag: `countdown-${item.id}`,
      });
      // 記錄今天已發過通知
      await cache.put("/sw-sent-date", new Response(todayStr));
    }
  }
}
