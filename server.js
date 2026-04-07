// server.js - 本地測試伺服器
// 執行：node --env-file=.env server.js
// 開啟：http://localhost:3000

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// ── Firebase 初始化 ────────────────────────────────────────
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

function getDb() {
  if (!getApps().length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error("FIREBASE_SERVICE_ACCOUNT 環境變數未設定");
    }
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }
  return getFirestore();
}

// ── 靜態檔案 MIME ──────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon',
};

// ── Token 產生 ─────────────────────────────────────────────
const crypto = require('crypto');
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// ── 密碼雜湊（PBKDF2 + salt）──────────────────────────────
function generateSalt() {
  return crypto.randomBytes(16).toString('hex'); // 32 字元 hex
}

function pbkdf2Hash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, 'sha256', (err, key) => {
      if (err) reject(err);
      else resolve(key.toString('hex'));
    });
  });
}

// 驗證密碼（支援新格式 PBKDF2 和舊格式 SHA-256 漸進遷移）
async function verifyPassword(inputPassword, storedData) {
  if (storedData.passwordHash && storedData.salt) {
    // 新格式：PBKDF2
    const hash = await pbkdf2Hash(inputPassword, storedData.salt);
    return hash === storedData.passwordHash;
  } else if (storedData.password) {
    // 舊格式：Firestore 存的是 SHA-256(密碼)，前端現在傳明文
    // 需要先對明文做一次 SHA-256 再比對
    const sha256 = crypto.createHash('sha256').update(inputPassword).digest('hex');
    return storedData.password === sha256;
  }
  return false;
}

// ── 核心邏輯 ───────────────────────────────────────────────
async function handleAction(p) {
  const db = getDb();
  const { action, user, sheet, key, token, password, value, displayName } = p;

  // ── Token 驗證（_shared 不驗證）────────────────────────
  async function verifyToken() {
    if (!token) return false;
    const sessionDoc = await db.collection("_sessions").doc(token).get();
    if (!sessionDoc.exists) return false;
    const session = sessionDoc.data();
    if (session.user !== user) return false;
    if (Date.now() > session.expiresAt) {
      await db.collection("_sessions").doc(token).delete();
      return false;
    }
    await db.collection("_sessions").doc(token).update({
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return true;
  }

  // ── sharedToken 驗證（用於 _shared 操作）───────────────
  // 接受個人 token 或 sharedToken 其中一個有效即可
  // apiUser：發出請求的真實帳號（即使 user="_shared" 也會帶這個）
  async function verifySharedToken() {
    const { sharedToken, apiUser } = p;

    // 先試 sharedToken
    if (sharedToken) {
      const snapshot = await db.collection("_users")
        .where("sharedToken", "==", sharedToken).limit(1).get();
      if (!snapshot.empty) return true;
    }

    // 再試個人 token（用 apiUser 驗證，讓無夥伴者也能存取自己的 _shared 資料）
    if (token && apiUser) {
      const sessionDoc = await db.collection("_sessions").doc(token).get();
      if (sessionDoc.exists) {
        const session = sessionDoc.data();
        if (session.user === apiUser && Date.now() <= session.expiresAt) return true;
      }
    }

    return false;
  }

  // ── 輸入驗證 ──────────────────────────────────────────
  // 帳號格式：只允許英數字、中文、底線，不能純數字，不能以數字開頭
  function isValidUsername(u) {
    if (!u || u.length < 1 || u.length > 50) return false;
    if (!/^[a-zA-Z\u4e00-\u9fa5_]/.test(u)) return false;  // 不能以數字開頭
    if (/^[0-9]+$/.test(u)) return false;                    // 不能純數字
    if (!/^[a-zA-Z0-9\u4e00-\u9fa5_]+$/.test(u)) return false;
    return true;
  }

  // ── auth ──────────────────────────────────────────────
  if (action === "auth") {
    if (!isValidUsername(p.user)) {
      return { ok: false, error: "帳號格式不正確（只允許英文、數字、中文、底線，且不能以數字開頭）" };
    }

    const ref = db.collection("_users").doc(p.user);
    const doc = await ref.get();

    if (!doc.exists) {
      // 新使用者：用 PBKDF2 建立帳號
      const name = displayName && displayName.trim() && displayName !== "__check__"
        ? displayName.trim() : p.user;
      const salt = generateSalt();
      const passwordHash = await pbkdf2Hash(password, salt);
      await ref.set({ passwordHash, salt, displayName: name, plannerName: "", height: "", budgetPartner: "", sharedToken: "" });
      const newToken = generateToken();
      await db.collection("_sessions").doc(newToken).set({
        user: p.user,
        expiresAt: Date.now() + TOKEN_TTL_MS,
      });
      return { isNew: true, displayName: name, token: newToken };
    }

    // 既有使用者：驗證密碼（支援舊 SHA-256 漸進遷移）
    const data = doc.data();
    const isValid = await verifyPassword(password, data);
    if (!isValid) {
      return { ok: false, error: "帳號或密碼錯誤" };
    }

    // 如果是舊格式，自動升級成 PBKDF2
    if (!data.passwordHash) {
      const salt = generateSalt();
      const passwordHash = await pbkdf2Hash(password, salt);
      await ref.update({ passwordHash, salt, password: null });
    }

    // 密碼正確：產生新 token
    const newToken = generateToken();
    await db.collection("_sessions").doc(newToken).set({
      user: p.user,
      expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return { isNew: false, displayName: data.displayName || p.user, token: newToken };
  }

  // ── logout ────────────────────────────────────────────
  if (action === "logout") {
    if (token) await db.collection("_sessions").doc(token).delete();
    return { ok: true };
  }

  // ── updateName ────────────────────────────────────────
  if (action === "updateName") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ displayName: displayName || "" });
    return { ok: true };
  }

  // ── getModules ────────────────────────────────────────
  if (action === "getModules") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().enabledModules || ["planner"]) : ["planner"];
  }

  // ── saveModules ───────────────────────────────────────
  if (action === "saveModules") {
    if (!await verifyToken()) return { ok: false };
    const modules = JSON.parse(value || "[\"planner\"]");
    await db.collection("_users").doc(user).update({ enabledModules: modules });
    return { ok: true };
  }

  // ── getSetting ────────────────────────────────────────
  if (action === "getSetting") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().plannerName || "") : "";
  }

  // ── saveSetting ───────────────────────────────────────
  if (action === "saveSetting") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ plannerName: value || "" });
    return { ok: true };
  }

  // ── getHeight ─────────────────────────────────────────
  if (action === "getHeight") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().height || "") : "";
  }

  // ── saveHeight ────────────────────────────────────────
  if (action === "saveHeight") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ height: value || "" });
    return { ok: true };
  }

  // ── getNotificationSentDate ───────────────────────────
  if (action === "getNotificationSentDate") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().notificationSentDate || "") : "";
  }

  // ── savePushSubscription ──────────────────────────────
  if (action === "savePushSubscription") {
    if (!await verifyToken()) return { ok: false };
    const subscription = p.subscription;
    if (!subscription) return { ok: false };
    await db.collection("_users").doc(user).update({
      pushSubscription: subscription
    });
    return { ok: true };
  }

  // ── getAvatar ─────────────────────────────────────────
  if (action === "getAvatar") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().avatar || "👤") : "👤";
  }

  // ── saveAvatar ────────────────────────────────────────
  if (action === "saveAvatar") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ avatar: value || "👤" });
    return { ok: true };
  }

  // ── getBudgetPartner ──────────────────────────────────
  if (action === "getBudgetPartner") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().budgetPartner || "") : "";
  }

  // ── getSharedToken ────────────────────────────────────
  if (action === "getSharedToken") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().sharedToken || "") : "";
  }

  // ── initUser（合併初始化，減少 roundtrip）─────────────
  if (action === "initUser") {
    if (!await verifyToken()) return { ok: false };
    const doc = await db.collection("_users").doc(user).get();
    if (!doc.exists) return { ok: true, plannerName: "", avatar: "👤", enabledModules: ["planner"], budgetPartner: "", sharedToken: "", loginTheme: null, defaultModule: "planner" };
    const d = doc.data();
    return {
      ok: true,
      plannerName: d.plannerName || "",
      avatar: d.avatar || "👤",
      enabledModules: d.enabledModules || ["planner"],
      budgetPartner: d.budgetPartner || "",
      sharedToken: d.sharedToken || "",
      loginTheme: d.loginTheme || null,
      defaultModule: d.defaultModule || "planner",
    };
  }

  // ── saveDefaultModule ─────────────────────────────────
  if (action === "saveDefaultModule") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ defaultModule: value || "planner" });
    return { ok: true };
  }

  // ── setPartner ────────────────────────────────────────
  if (action === "setPartner") {
    if (!await verifyToken()) return { ok: false, error: "驗證失敗" };
    const partnerUser = (p.partnerUser || "").trim();
    if (!partnerUser || partnerUser === user) {
      return { ok: false, error: "無效的夥伴帳號" };
    }

    // 確認夥伴帳號存在
    const partnerDoc = await db.collection("_users").doc(partnerUser).get();
    if (!partnerDoc.exists) {
      return { ok: false, error: "找不到此帳號" };
    }

    // 確認夥伴是否已被其他人綁定
    const partnerData = partnerDoc.data();
    if (partnerData.budgetPartner && partnerData.budgetPartner !== user) {
      return { ok: false, error: `${partnerUser} 已與其他人建立記帳關係` };
    }

    // 確認自己是否已有夥伴
    const myDoc = await db.collection("_users").doc(user).get();
    const myData = myDoc.data();
    if (myData.budgetPartner && myData.budgetPartner !== partnerUser) {
      return { ok: false, error: "請先解除目前的記帳夥伴關係" };
    }

    // 產生共用 sharedToken 並寫入雙方
    const newSharedToken = generateToken();
    await db.collection("_users").doc(user).update({
      budgetPartner: partnerUser,
      sharedToken: newSharedToken,
    });
    await db.collection("_users").doc(partnerUser).update({
      budgetPartner: user,
      sharedToken: newSharedToken,
    });
    return { ok: true, sharedToken: newSharedToken, partner: partnerUser };
  }

  // ── removePartner ─────────────────────────────────────
  if (action === "removePartner") {
    if (!await verifyToken()) return { ok: false, error: "驗證失敗" };
    const myDoc = await db.collection("_users").doc(user).get();
    if (!myDoc.exists) return { ok: false };
    const partnerUser = myDoc.data().budgetPartner;

    // 清空自己
    await db.collection("_users").doc(user).update({
      budgetPartner: "",
      sharedToken: "",
    });
    // 清空夥伴（如果存在）
    if (partnerUser) {
      const partnerDoc = await db.collection("_users").doc(partnerUser).get();
      if (partnerDoc.exists) {
        await db.collection("_users").doc(partnerUser).update({
          budgetPartner: "",
          sharedToken: "",
        });
      }
    }
    return { ok: true };
  }

  // ── 資料 CRUD ─────────────────────────────────────────
  // _shared collection 用 sharedToken 驗證，個人 collection 用 token 驗證
  if (user === "_shared") {
    if (!await verifySharedToken()) return action === "readOne" ? null : (action === "readAll" ? [] : { ok: false, error: "sharedToken 無效" });
    const sharedCollection = `_shared_${sheet}`;

    if (action === "readAll") {
      const snapshot = await db.collection(sharedCollection).get();
      if (snapshot.empty) return [];
      return snapshot.docs.map(doc => [doc.id, doc.data().value]);
    }
    if (action === "readOne") {
      const doc = await db.collection(sharedCollection).doc(String(key)).get();
      if (!doc.exists) return null;
      return doc.data().value;
    }
    if (action === "writeOne") {
      if (String(value).length > 512000) return { ok: false, error: "資料大小超過限制（500 KB）" };
      await db.collection(sharedCollection).doc(String(key)).set({ value: String(value) });
      return { ok: true };
    }
    if (action === "deleteOne") {
      await db.collection(sharedCollection).doc(String(key)).delete();
      return { ok: true };
    }
    return { error: "unknown action" };
  }

  const collectionName = `${user}_${sheet}`;

  if (action === "readAll") {
    if (!await verifyToken()) return [];
    const snapshot = await db.collection(collectionName).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map(doc => [doc.id, doc.data().value]);
  }

  if (action === "readOne") {
    if (!await verifyToken()) return null;
    const doc = await db.collection(collectionName).doc(String(key)).get();
    if (!doc.exists) return null;
    return doc.data().value;
  }

  if (action === "writeOne") {
    if (!await verifyToken()) return { ok: false };
    if (String(value).length > 512000) return { ok: false, error: "資料大小超過限制（500 KB）" };
    await db.collection(collectionName).doc(String(key)).set({ value: String(value) });
    return { ok: true };
  }

  if (action === "deleteOne") {
    if (!await verifyToken()) return { ok: false };
    await db.collection(collectionName).doc(String(key)).delete();
    return { ok: true };
  }

  return { error: "unknown action" };
}

// ── HTTP Server ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // ── API ────────────────────────────────────────────────
  if (pathname === '/api') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': 'http://localhost:3000',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end(JSON.stringify({ error: 'Method Not Allowed' }));
      return;
    }

    // 讀取 POST body
    let bodyParams = {};
    try {
      const raw = await new Promise((resolve, reject) => {
        let buf = '';
        req.on('data', chunk => buf += chunk);
        req.on('end', () => resolve(buf));
        req.on('error', reject);
      });
      bodyParams = JSON.parse(raw || '{}');
    } catch { bodyParams = {}; }

    // 合併 query string（非敏感）與 body（敏感）
    const p = { ...parsedUrl.query, ...bodyParams };

    try {
      const result = await handleAction(p);
      console.log(`[${p.action}]`, JSON.stringify(result).slice(0, 80));
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': 'http://localhost:3000',
      });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('handleAction error:', err);
      res.writeHead(500);
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // ── 靜態檔案 ───────────────────────────────────────────
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = path.join(__dirname, filePath);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end(`找不到檔案：${pathname}`);
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'text/plain' });
    res.end(data);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ 本地伺服器啟動成功！`);
  console.log(`👉 開啟瀏覽器：http://localhost:3000`);
  console.log(`⏹  停止：按 Ctrl+C`);
});