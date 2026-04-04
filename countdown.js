// ── countdown.js ───────────────────────────────────────────
// 倒數計時模組

const { useState, useEffect, useRef } = React;

const SHEET = "countdown";
const KEY = "list";

// ── 計算倒數天數 ───────────────────────────────────────────
function calcDaysLeft(dateStr, repeat) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");

  if (!repeat) {
    const diff = Math.round((target - today) / (1000 * 60 * 60 * 24));
    return diff;
  }

  // 每年重複：找今年或明年最近的日期
  const thisYear = new Date(today.getFullYear(), target.getMonth(), target.getDate());
  thisYear.setHours(0, 0, 0, 0);
  if (thisYear >= today) {
    return Math.round((thisYear - today) / (1000 * 60 * 60 * 24));
  }
  const nextYear = new Date(today.getFullYear() + 1, target.getMonth(), target.getDate());
  return Math.round((nextYear - today) / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr, repeat) {
  const d = new Date(dateStr + "T00:00:00");
  const m = d.getMonth() + 1;
  const day = d.getDate();
  if (repeat) return `每年 ${m}/${day}`;
  const y = d.getFullYear();
  return `${y}/${m}/${day}`;
}

// ── 新增/編輯 Modal ────────────────────────────────────────
function CountdownModal({ item, onSave, onClose }) {
  const [name, setName] = useState(item?.name || "");
  const [date, setDate] = useState(item?.date || "");
  const [repeat, setRepeat] = useState(item?.repeat ?? true);
  const [notify, setNotify] = useState(item?.notify ?? false);
  const [error, setError] = useState("");

  async function handleNotifyToggle() {
    if (!notify) {
      // 開啟通知前先確認權限
      if ("Notification" in window) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          alert("請允許通知權限才能使用此功能");
          return;
        }
      }
    }
    setNotify(p => !p);
  }

  function handleSave() {
    if (!name.trim()) { setError("請輸入名稱"); return; }
    if (!date) { setError("請選擇日期"); return; }
    onSave({
      id: item?.id || Date.now(),
      name: name.trim(),
      date,
      repeat,
      notify,
    });
  }

  const inp = {
    width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 10,
    padding: "10px 12px", fontSize: 15, color: C.text, background: C.bg,
    outline: "none", boxSizing: "border-box",
  };

  const toggle = (val, set) => (
    <div onClick={() => set(!val)}
      style={{ width: 44, height: 24, borderRadius: 12, background: val ? C.accent : C.border,
        cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: val ? 22 : 2, width: 20, height: 20,
        borderRadius: 10, background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </div>
  );

  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 999, display: "flex", alignItems: "flex-end", background: "rgba(0,0,0,0.2)" }}
      onClick={onClose}>
      <div className="pop-in" onClick={e => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 430, margin: "0 auto", background: C.card,
          borderRadius: "20px 20px 0 0", padding: "24px 20px 48px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: C.text }}>{item ? "編輯" : "新增紀念日"}</div>
          <button onClick={onClose} style={{ background: C.border, border: "none", borderRadius: 10, width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>名稱</div>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="例如：結婚紀念日" style={inp} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>日期</div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} />
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, color: C.text }}>每年重複</div>
              <div style={{ fontSize: 12, color: C.sub }}>到期後自動跳到明年</div>
            </div>
            {toggle(repeat, setRepeat)}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 14, color: C.text }}>當天通知</div>
              <div style={{ fontSize: 12, color: C.sub }}>需先將 App 加到主畫面</div>
            </div>
            {toggle(notify, handleNotifyToggle)}
          </div>

          {error && <div style={{ fontSize: 13, color: C.red }}>{error}</div>}

          <button onClick={handleSave}
            style={{ width: "100%", padding: "13px 0", borderRadius: 12, border: "none",
              background: C.accent, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", marginTop: 4 }}>
            儲存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── 倒數卡片 ───────────────────────────────────────────────
function CountdownCard({ item, onTap }) {
  const days = calcDaysLeft(item.date, item.repeat);
  const isToday = days === 0;
  const isPast = days < 0;

  return (
    <button onClick={onTap}
      style={{ background: isToday ? C.accent : C.card, borderRadius: 16,
        padding: "18px 14px", display: "flex", flexDirection: "column",
        alignItems: "flex-start", justifyContent: "space-between",
        border: `1.5px solid ${isToday ? C.accent : C.border}`,
        cursor: "pointer", textAlign: "left", minHeight: 120,
        boxShadow: "0 1px 4px rgba(0,0,0,0.06)", width: "100%" }}>

      <div style={{ fontSize: 13, fontWeight: 600,
        color: isToday ? "#fff" : C.text,
        marginBottom: 8, lineHeight: 1.3, wordBreak: "break-all" }}>
        {item.name}
      </div>

      <div>
        <div style={{ fontSize: isToday ? 22 : 28, fontWeight: 800,
          color: isToday ? "#fff" : isPast ? C.sub : C.accent, lineHeight: 1 }}>
          {isToday ? "今天" : isPast ? `${Math.abs(days)} 天前` : `${days} 天`}
        </div>
        <div style={{ fontSize: 11, color: isToday ? "rgba(255,255,255,0.8)" : C.sub, marginTop: 4 }}>
          {formatDate(item.date, item.repeat)}
        </div>
      </div>
    </button>
  );
}

// ── Countdown App ──────────────────────────────────────────
function CountdownApp({ user, token }) {
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (cacheHas(user, SHEET, KEY)) {
      const cached = cacheGet(user, SHEET, KEY);
      try { setItems(cached ? JSON.parse(cached) : []); } catch { setItems([]); }
      setLoaded(true);
      return;
    }
    apiCall({ action: "readOne", user, sheet: SHEET, key: KEY, token }).then(val => {
      const str = typeof val === "string" ? val : JSON.stringify(val || []);
      cacheSet(user, SHEET, KEY, str);
      try { setItems(val ? (Array.isArray(val) ? val : JSON.parse(val)) : []); } catch { setItems([]); }
      setLoaded(true);
    });
  }, []);

  function save(next) {
    setItems(next);
    cacheSet(user, SHEET, KEY, JSON.stringify(next));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await writeOne(user, SHEET, KEY, JSON.stringify(next), token);
      // 同步更新 SW cache，讓背景通知能讀到最新資料
      if ("caches" in window) {
        const cache = await caches.open("my-planner-v1");
        await cache.put("/sw-countdown", new Response(JSON.stringify(next)));
      }
    }, 1000);
  }

  function handleSave(item) {
    const next = editItem
      ? items.map(i => i.id === item.id ? item : i)
      : [...items, item];
    save(next);
    setShowModal(false);
    setEditItem(null);
  }

  function handleDelete(id) {
    if (!confirm("確定要刪除這個紀念日嗎？")) return;
    save(items.filter(i => i.id !== id));
  }

  function openEdit(item) {
    setEditItem(item);
    setShowModal(true);
  }

  // 排序：剩餘天數由近到遠，負數（已過）排最後
  const sorted = [...items].sort((a, b) => {
    const da = calcDaysLeft(a.date, a.repeat);
    const db = calcDaysLeft(b.date, b.repeat);
    if (da < 0 && db >= 0) return 1;
    if (db < 0 && da >= 0) return -1;
    return da - db;
  });

  if (!loaded) return <Spinner />;

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", background: C.bg }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 14px", background: C.bg, flexShrink: 0, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 18, fontFamily: "'Noto Serif TC',serif", fontWeight: 700, color: C.text }}>
          紀念日
        </div>
      </div>

      {/* 內容 */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 20px 120px" }}>
        {items.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: C.sub, fontSize: 14 }}>
            還沒有紀念日，點 + 新增
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {sorted.map(item => (
              <div key={item.id} style={{ position: "relative" }}>
                <CountdownCard item={item} onTap={() => openEdit(item)} />
                <button onClick={() => handleDelete(item.id)}
                  style={{ position: "absolute", top: 8, right: 8, background: "none",
                    border: "none", color: C.sub, fontSize: 11, cursor: "pointer", padding: "2px 4px" }}>
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* + 按鈕 */}
      <button onClick={() => { setEditItem(null); setShowModal(true); }}
        style={{ position: "fixed", bottom: 32, right: 24, width: 52, height: 52,
          borderRadius: 26, background: C.accent, border: "none", color: "#fff",
          fontSize: 26, cursor: "pointer", boxShadow: "0 4px 16px rgba(74,124,89,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
        +
      </button>

      {showModal && (
        <CountdownModal
          item={editItem}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditItem(null); }}
        />
      )}
    </div>
  );
}