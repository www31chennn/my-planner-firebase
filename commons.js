// ── commons.js ────────────────────────────────────────────
// 所有模組共用的函式、元件、快取

// ── API ───────────────────────────────────────────────────
const API = (() => {
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") return "http://localhost:3000/api";
  return "/api/proxy";
})();

// 敏感欄位走 POST body，其餘走 query string
const SENSITIVE_KEYS = new Set(["token", "sharedToken", "apiUser", "password", "value", "displayName", "subscription"]);

async function apiCall(params) {
  try {
    const queryParams = {};
    const bodyParams = {};
    Object.entries(params).forEach(([k, v]) => {
      if (SENSITIVE_KEYS.has(k)) bodyParams[k] = v;
      else queryParams[k] = v;
    });

    const qs = Object.entries(queryParams)
      .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join("&");

    const res = await fetch(`${API}?${qs}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyParams),
    });
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  } catch(e) { console.error("API error:", e); return null; }
}

async function writeOne(user, sheet, key, value, token) {
  const sharedToken = window._SHARED_TOKEN || "";
  const apiUser = window._API_USER || "";
  return await apiCall({ action:"writeOne", user, sheet, key:String(key), value:String(value), token, sharedToken, apiUser });
}

async function deleteOne(user, sheet, key, token) {
  const sharedToken = window._SHARED_TOKEN || "";
  const apiUser = window._API_USER || "";
  return await apiCall({ action:"deleteOne", user, sheet, key:String(key), token, sharedToken, apiUser });
}

// ── 全域快取（用 window 讓所有模組共用）────────────────────
window._CACHE = window._CACHE || {};

function cacheGet(user, sheet, key) {
  return window._CACHE[`${user}:${sheet}:${key}`];
}
function cacheSet(user, sheet, key, value) {
  window._CACHE[`${user}:${sheet}:${key}`] = value;
}
function cacheHas(user, sheet, key) {
  return `${user}:${sheet}:${key}` in window._CACHE;
}
function cacheUpdate(user, sheet, key, value) {
  cacheSet(user, sheet, key, value);
}

async function cachedReadOne(user, sheet, key, token) {
  if (cacheHas(user, sheet, key)) return cacheGet(user, sheet, key);
  const raw = await apiCall({ action:"readOne", user, sheet, key:String(key), token });
  let val = "";
  if (raw === null || raw === undefined) {
    val = "";
  } else if (typeof raw === "string") {
    val = raw;
  } else {
    val = JSON.stringify(raw);
  }
  cacheSet(user, sheet, key, val);
  return val;
}

// ── 共用元件 ───────────────────────────────────────────────
const C = {
  bg:"#F7F5F2", card:"#FFFFFF", border:"#EBEBEB",
  text:"#1A1A1A", sub:"#9A9A9A", accent:"#4A7C59",
  accentLight:"#EAF2EC", red:"#D0533A",
};

function SaveDot({ saving }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, fontSize:11, color:saving?C.sub:C.accent }}>
      <div style={{ width:6, height:6, borderRadius:3, background:saving?C.sub:C.accent, transition:"background 0.3s" }} />
      {saving?"儲存中":"已儲存"}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ padding:40, display:"flex", justifyContent:"center" }}>
      <div style={{ width:28, height:28, borderRadius:14, border:`3px solid ${C.border}`, borderTopColor:C.accent, animation:"spin 0.8s linear infinite" }} />
    </div>
  );
}
