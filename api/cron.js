// ── api/cron.js ────────────────────────────────────────────
// Vercel Cron Job：每天凌晨 12 點（UTC+8）發送紀念日推播通知
// UTC 16:00（前一天）= 台灣時間 00:00

const webpush = require("web-push");
const admin = require("firebase-admin");

// ── Firebase 初始化 ────────────────────────────────────────
let db;
function getDb() {
  if (!db) {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
    }
    db = admin.firestore();
  }
  return db;
}

// ── VAPID 設定 ─────────────────────────────────────────────
webpush.setVapidDetails(
  process.env.VAPID_EMAIL,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── 計算今天是否符合倒數日 ─────────────────────────────────
function isToday(item) {
  const now = new Date();
  // 轉換成台灣時間（UTC+8）取得今天日期字串
  const twTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayStr = `${twTime.getUTCFullYear()}-${String(twTime.getUTCMonth()+1).padStart(2,'0')}-${String(twTime.getUTCDate()).padStart(2,'0')}`;
  const [ty, tm, td] = todayStr.split('-').map(Number);

  const [iy, im, id] = item.date.split('-').map(Number);

  if (item.repeat) {
    return im === tm && id === td;
  } else {
    return iy === ty && im === tm && id === td;
  }
}

// ── 主邏輯 ────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  // 驗證 Vercel Cron 請求
  if (req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const db = getDb();
  let sent = 0;
  let failed = 0;

  try {
    // 讀取所有使用者
    const usersSnap = await db.collection("_users").get();
    console.log(`[cron] 共 ${usersSnap.docs.length} 個使用者`);

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.id;
      const userData = userDoc.data();

      const subscriptions = userData.pushSubscriptions
        || (userData.pushSubscription ? [userData.pushSubscription] : []);
      console.log(`[cron] ${user}: ${subscriptions.length} 個訂閱`);
      if (subscriptions.length === 0) continue;

      const countdownDoc = await db.collection(`${user}_countdown`).doc("list").get();
      if (!countdownDoc.exists) { console.log(`[cron] ${user}: 無倒數日資料`); continue; }

      let items = [];
      try {
        const val = countdownDoc.data().value;
        items = typeof val === "string" ? JSON.parse(val) : val;
        if (!Array.isArray(items)) items = [];
      } catch { continue; }

      const todayItems = items.filter(item => item.notify && isToday(item));
      console.log(`[cron] ${user}: ${items.length} 個倒數日，今天符合 ${todayItems.length} 個`);
      if (todayItems.length === 0) continue;

      // 發送推播給所有裝置
      const expiredEndpoints = [];
      let userSent = 0;
      for (const subscription of subscriptions) {
        for (const item of todayItems) {
          try {
            await webpush.sendNotification(
              subscription,
              JSON.stringify({
                title: "my-planner",
                body: `今天是 ${item.name}`,
              })
            );
            console.log(`[cron] ${user}: 發送成功 — ${item.name} → ${subscription.endpoint.slice(0,40)}...`);
            userSent++;
            sent++;
          } catch (err) {
            console.log(`[cron] ${user}: 發送失敗 — ${item.name}, status=${err.statusCode}, msg=${err.message}`);
            if (err.statusCode === 410 || err.statusCode === 404) {
              expiredEndpoints.push(subscription.endpoint);
            }
            failed++;
          }
        }
      }
      // 清除失效的 subscriptions
      if (expiredEndpoints.length > 0) {
        const remaining = subscriptions.filter(s => !expiredEndpoints.includes(s.endpoint));
        await userDoc.ref.update({ pushSubscriptions: remaining });
      }
      // 記錄今天已從 server 發過通知，讓 SW 不重複發
      if (userSent > 0) {
        const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
        const sentDate = `${twNow.getUTCFullYear()}-${String(twNow.getUTCMonth()+1).padStart(2,"0")}-${String(twNow.getUTCDate()).padStart(2,"0")}`;
        await userDoc.ref.update({ notificationSentDate: sentDate });
      }
    }

    console.log(`[cron] 完成：sent=${sent}, failed=${failed}`);
    return res.status(200).json({ ok: true, sent, failed });
  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
};
