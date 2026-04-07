// ── api/cron.js ────────────────────────────────────────────
// Vercel Cron Job：每天中午 12 點（UTC+8）發送紀念日推播通知
// UTC 4:00 = 台灣時間 12:00

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
  // 轉換成台灣時間（UTC+8）
  const twTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const todayMonth = twTime.getUTCMonth();
  const todayDate = twTime.getUTCDate();
  const todayYear = twTime.getUTCFullYear();

  const target = new Date(item.date + "T00:00:00Z");

  if (item.repeat) {
    return target.getUTCMonth() === todayMonth && target.getUTCDate() === todayDate;
  } else {
    return (
      target.getUTCFullYear() === todayYear &&
      target.getUTCMonth() === todayMonth &&
      target.getUTCDate() === todayDate
    );
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

    for (const userDoc of usersSnap.docs) {
      const user = userDoc.id;
      const userData = userDoc.data();

      // 沒有推播訂閱就跳過
      if (!userData.pushSubscription) continue;

      // 讀取這個使用者的倒數日清單
      const countdownDoc = await db.collection(`${user}_countdown`).doc("list").get();
      if (!countdownDoc.exists) continue;

      let items = [];
      try {
        const val = countdownDoc.data().value;
        items = typeof val === "string" ? JSON.parse(val) : val;
        if (!Array.isArray(items)) items = [];
      } catch { continue; }

      // 找出今天符合且開啟通知的項目
      const todayItems = items.filter(item => item.notify && isToday(item));
      if (todayItems.length === 0) continue;

      // 發送推播
      const subscription = userData.pushSubscription;
      let userSent = 0;
      for (const item of todayItems) {
        try {
          await webpush.sendNotification(
            subscription,
            JSON.stringify({
              title: "my-planner",
              body: `今天是 ${item.name}`,
            })
          );
          userSent++;
          sent++;
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await userDoc.ref.update({ pushSubscription: null });
          }
          failed++;
        }
      }
      // 記錄今天已從 server 發過通知，讓 SW 不重複發
      if (userSent > 0) {
        const twNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
        const sentDate = `${twNow.getUTCFullYear()}-${String(twNow.getUTCMonth()+1).padStart(2,"0")}-${String(twNow.getUTCDate()).padStart(2,"0")}`;
        await userDoc.ref.update({ notificationSentDate: sentDate });
      }
    }

    return res.status(200).json({ ok: true, sent, failed });
  } catch (err) {
    console.error("Cron error:", err);
    return res.status(500).json({ error: err.message });
  }
};
