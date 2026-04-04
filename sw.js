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

// ── 背景 fetch（讓 SW 可以呼叫 API）──────────────────────
self.addEventListener("message", e => {
  if (e.data?.type === "CHECK_COUNTDOWNS") {
    checkCountdowns();
  }
});

async function checkCountdowns() {
  // 確認有通知權限才繼續
  if (Notification.permission !== "granted") return;

  // 從 SW 的 cache 讀取倒數日資料和 session
  const cache = await caches.open(CACHE_NAME);
  const sessionRes = await cache.match("/sw-session");
  const itemsRes = await cache.match("/sw-countdown");
  if (!sessionRes || !itemsRes) return;

  const session = await sessionRes.json();
  const items = await itemsRes.json();
  if (!Array.isArray(items)) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;

  for (const item of items) {
    if (!item.notify) continue;

    const target = new Date(item.date + "T00:00:00");
    let match = false;

    if (item.repeat) {
      // 每年重複：比對月和日
      match = (target.getMonth() === today.getMonth() && target.getDate() === today.getDate());
    } else {
      // 不重複：比對完整日期
      const itemDateStr = item.date;
      match = itemDateStr === todayStr;
    }

    if (match) {
      await self.registration.showNotification("my-planner", {
        body: `今天是 ${item.name}`,
        icon: "/icon.png",
        badge: "/icon.png",
        tag: `countdown-${item.id}`,
      });
    }
  }
}