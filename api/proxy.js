// api/proxy.js - Vercel Serverless Function
// 直接操作 Firebase Firestore，不再經過 GAS

const { initializeApp, cert, getApps } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");

// ── Firebase 初始化 ────────────────────────────────────────
function getDb() {
  if (!getApps().length) {
    initializeApp({
      credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  }
  return getFirestore();
}

// ── Origin 白名單 ──────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || "")
  .split(",").map(o => o.trim()).filter(Boolean);

function getCorsHeaders(origin) {
  return {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    ...(ALLOWED_ORIGINS.includes(origin) && {
      "Access-Control-Allow-Origin": origin,
      "Vary": "Origin",
    }),
  };
}

// ── 主要 handler ───────────────────────────────────────────
module.exports = async function handler(req, res) {
  const origin = req.headers["origin"] || "";
  const corsHeaders = getCorsHeaders(origin);
  Object.entries(corsHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  // 合併 query string 與 POST body
  const p = { ...req.query, ...(req.body || {}) };

  try {
    const result = await handleAction(p);
    return res.status(200).json(result);
  } catch (err) {
    console.error("Handler error:", err);
    return res.status(500).json({ error: err.message });
  }
}

// ── Token 產生 ─────────────────────────────────────────────
const crypto = require("crypto");
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 天

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function pbkdf2Hash(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, 100000, 32, "sha256", (err, key) => {
      if (err) reject(err);
      else resolve(key.toString("hex"));
    });
  });
}

async function verifyPassword(inputPassword, storedData) {
  if (storedData.passwordHash && storedData.salt) {
    // 新格式：PBKDF2
    const hash = await pbkdf2Hash(inputPassword, storedData.salt);
    return hash === storedData.passwordHash;
  } else if (storedData.password) {
    // 舊格式：Firestore 存的是 SHA-256(密碼)，前端現在傳明文
    const sha256 = crypto.createHash("sha256").update(inputPassword).digest("hex");
    return storedData.password === sha256;
  }
  return false;
}

// ── 核心邏輯 ───────────────────────────────────────────────
async function handleAction(p) {
  const db = getDb();
  const { action, user, sheet, key, token, password, value, displayName } = p;

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
  function isValidUsername(u) {
    if (!u || u.length < 1 || u.length > 50) return false;
    if (!/^[a-zA-Z\u4e00-\u9fa5_]/.test(u)) return false;
    if (/^[0-9]+$/.test(u)) return false;
    if (!/^[a-zA-Z0-9\u4e00-\u9fa5_]+$/.test(u)) return false;
    return true;
  }

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
        user: p.user, expiresAt: Date.now() + TOKEN_TTL_MS,
      });
      return { isNew: true, displayName: name, token: newToken };
    }
    const data = doc.data();
    const isValid = await verifyPassword(password, data);
    if (!isValid) return { ok: false, error: "帳號或密碼錯誤" };

    // 舊格式自動升級成 PBKDF2
    if (!data.passwordHash) {
      const salt = generateSalt();
      const passwordHash = await pbkdf2Hash(password, salt);
      await ref.update({ passwordHash, salt, password: null });
    }

    const newToken = generateToken();
    await db.collection("_sessions").doc(newToken).set({
      user: p.user, expiresAt: Date.now() + TOKEN_TTL_MS,
    });
    return { isNew: false, displayName: data.displayName || p.user, token: newToken };
  }

  if (action === "logout") {
    if (token) await db.collection("_sessions").doc(token).delete();
    return { ok: true };
  }

  if (action === "updateName") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ displayName: displayName || "" });
    return { ok: true };
  }

  if (action === "getSetting") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().plannerName || "") : "";
  }

  if (action === "saveSetting") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ plannerName: value || "" });
    return { ok: true };
  }

  if (action === "getHeight") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().height || "") : "";
  }

  if (action === "saveHeight") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ height: value || "" });
    return { ok: true };
  }

  if (action === "getAvatar") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().avatar || "👤") : "👤";
  }

  if (action === "saveAvatar") {
    if (!await verifyToken()) return { ok: false };
    await db.collection("_users").doc(user).update({ avatar: value || "👤" });
    return { ok: true };
  }

  if (action === "getBudgetPartner") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().budgetPartner || "") : "";
  }

  if (action === "getSharedToken") {
    if (!await verifyToken()) return null;
    const doc = await db.collection("_users").doc(user).get();
    return doc.exists ? (doc.data().sharedToken || "") : "";
  }

  if (action === "setPartner") {
    if (!await verifyToken()) return { ok: false, error: "驗證失敗" };
    const partnerUser = (p.partnerUser || "").trim();
    if (!partnerUser || partnerUser === user) return { ok: false, error: "無效的夥伴帳號" };

    const partnerDoc = await db.collection("_users").doc(partnerUser).get();
    if (!partnerDoc.exists) return { ok: false, error: "找不到此帳號" };

    const partnerData = partnerDoc.data();
    if (partnerData.budgetPartner && partnerData.budgetPartner !== user) {
      return { ok: false, error: `${partnerUser} 已與其他人建立記帳關係` };
    }

    const myDoc = await db.collection("_users").doc(user).get();
    const myData = myDoc.data();
    if (myData.budgetPartner && myData.budgetPartner !== partnerUser) {
      return { ok: false, error: "請先解除目前的記帳夥伴關係" };
    }

    const newSharedToken = generateToken();
    await db.collection("_users").doc(user).update({
      budgetPartner: partnerUser, sharedToken: newSharedToken,
    });
    await db.collection("_users").doc(partnerUser).update({
      budgetPartner: user, sharedToken: newSharedToken,
    });
    return { ok: true, sharedToken: newSharedToken, partner: partnerUser };
  }

  if (action === "removePartner") {
    if (!await verifyToken()) return { ok: false, error: "驗證失敗" };
    const myDoc = await db.collection("_users").doc(user).get();
    if (!myDoc.exists) return { ok: false };
    const partnerUser = myDoc.data().budgetPartner;
    await db.collection("_users").doc(user).update({ budgetPartner: "", sharedToken: "" });
    if (partnerUser) {
      const partnerDoc = await db.collection("_users").doc(partnerUser).get();
      if (partnerDoc.exists) {
        await db.collection("_users").doc(partnerUser).update({ budgetPartner: "", sharedToken: "" });
      }
    }
    return { ok: true };
  }

  // ── _shared 用 sharedToken 驗證 ───────────────────────
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

