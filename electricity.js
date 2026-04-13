// ── electricity.js ──────────────────────────────────────────────
// 電表記錄模組

const { useState, useEffect, useRef } = React;

const MONTHS_E = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const DAYS_IN_MONTH_E = (m,y) => new Date(y,m,0).getDate();
const FIRST_DAY_E = (m,y) => new Date(y,m-1,1).getDay();

// 根據當日用電量（與前一天的差值）深淺著色
function getElecColor(usage, maxUsage) {
  if (!usage || usage <= 0 || !maxUsage) return { bg: "#EAF2EC", text: "#4A7C59" };
  const ratio = Math.min(usage / maxUsage, 1);
  const r = Math.round(74 + (208 - 74) * ratio);
  const g = Math.round(124 + (83 - 124) * ratio);
  const b = Math.round(89 + (58 - 89) * ratio);
  return { bg: `rgba(${r},${g},${b},0.15)`, text: `rgb(${r},${g},${b})` };
}

// SVG 折線圖共用邏輯
function renderLineChart(points, xPos, yPos, W, H, PAD, minV, maxV, gradId, labelKey) {
  if (points.length < 2) return null;
  const vals = points.map(p => p.value);
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p)} ${yPos(p.value)}`).join(' ');
  const areaD = pathD + ` L ${xPos(points[points.length-1])} ${PAD.top + (H - PAD.top - PAD.bottom)} L ${xPos(points[0])} ${PAD.top + (H - PAD.top - PAD.bottom)} Z`;
  const yTicks = [minV, Math.round((minV + maxV) / 2), maxV];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={C.accent} stopOpacity="0.18" />
          <stop offset="100%" stopColor={C.accent} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {yTicks.map((v, i) => {
        const y = yPos(v);
        return (
          <g key={i}>
            <line x1={PAD.left} y1={y} x2={W - PAD.right} y2={y} stroke={C.border} strokeWidth="1" strokeDasharray="3,3" />
            <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize="9" fill={C.sub}>{v}</text>
          </g>
        );
      })}
      <path d={areaD} fill={`url(#${gradId})`} />
      <path d={pathD} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={xPos(p)} cy={yPos(p.value)} r="3" fill={C.card} stroke={C.accent} strokeWidth="1.5" />
        </g>
      ))}
      {points.length > 0 && (
        <>
          <text x={xPos(points[0])} y={H - 4} textAnchor="middle" fontSize="9" fill={C.sub}>{points[0][labelKey]}</text>
          <text x={xPos(points[points.length-1])} y={H - 4} textAnchor="middle" fontSize="9" fill={C.sub}>{points[points.length-1][labelKey]}</text>
        </>
      )}
    </svg>
  );
}

// 圖表區塊（含 tab 切換）
// 當月每日用電折線圖
function DailyChart({ data, year, month }) {
  const [open, setOpen] = React.useState(false);
  const W = 320, H = 110, PAD = { top: 16, bottom: 24, left: 36, right: 12 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const daysCount = DAYS_IN_MONTH_E(month, year);
  const dailyPoints = [];
  const sortedKeys = Object.keys(data).filter(k => data[k] != null).sort();
  for (let i = 1; i < sortedKeys.length; i++) {
    const curr = sortedKeys[i];
    const prev = sortedKeys[i - 1];
    const diff = Math.round((data[curr] - data[prev]) * 10) / 10;
    if (diff < 0) continue;
    const daysBetween = Math.round((new Date(curr) - new Date(prev)) / 86400000);
    const perDay = Math.round((diff / daysBetween) * 10) / 10;
    for (let d = 1; d <= daysBetween; d++) {
      const date = new Date(new Date(prev).getTime() + d * 86400000);
      const dayNum = date.getDate();
      if (date.getFullYear() === year && date.getMonth() + 1 === month) {
        dailyPoints.push({ day: dayNum, value: perDay });
      }
    }
  }
  const dailyVals = dailyPoints.map(p => p.value);
  const minD = dailyVals.length ? Math.min(...dailyVals) : 0;
  const maxD = dailyVals.length ? Math.max(...dailyVals) : 1;
  const rangeD = maxD - minD || 1;
  function xPosDay(p) { return PAD.left + ((p.day - 1) / Math.max(daysCount - 1, 1)) * chartW; }
  function yPosDay(v) { return PAD.top + chartH - ((v - minD) / rangeD) * chartH; }

  return (
    <div style={{ background: C.card, borderRadius: 16, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>📈 當月每日用電</span>
        <span style={{ fontSize: 12, color: C.sub, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          {dailyPoints.length >= 2
            ? renderLineChart(dailyPoints, xPosDay, yPosDay, W, H, PAD, minD, maxD, 'eGradDaily', 'day')
            : <div style={{ textAlign: 'center', color: C.sub, fontSize: 12, padding: '16px 0' }}>至少需要 2 天的讀數</div>
          }
        </div>
      )}
    </div>
  );
}

// 年度每月總用電折線圖
function YearlyChart({ year, monthlyTotals, monthlyLoading, onOpen }) {
  const [open, setOpen] = React.useState(false);
  const W = 320, H = 110, PAD = { top: 16, bottom: 24, left: 36, right: 12 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const monthPoints = monthlyTotals.filter(m => m.total != null).map((m, i) => ({ ...m, value: m.total, idx: i }));
  const monthVals = monthPoints.map(p => p.value);
  const minM = monthVals.length ? Math.min(...monthVals) : 0;
  const maxM = monthVals.length ? Math.max(...monthVals) : 1;
  const rangeM = maxM - minM || 1;
  function xPosMonth(p) { return PAD.left + (p.idx / Math.max(monthPoints.length - 1, 1)) * chartW; }
  function yPosMonth(v) { return PAD.top + chartH - ((v - minM) / rangeM) * chartH; }

  return (
    <div style={{ background: C.card, borderRadius: 16, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <button onClick={() => {
        const next = !open;
        setOpen(next);
        if (next && onOpen) onOpen();
      }} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer' }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>📊 {year} 年每月用電</span>
        <span style={{ fontSize: 12, color: C.sub, display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          {monthlyLoading
            ? <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0' }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, border: `2px solid ${C.border}`, borderTopColor: C.accent, animation: 'spin 0.8s linear infinite' }} />
              </div>
            : monthPoints.length >= 2
              ? <>
                  {renderLineChart(monthPoints, xPosMonth, yPosMonth, W, H, PAD, minM, maxM, 'eGradMonthly', 'label')}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    {monthPoints.map((p, i) => (
                      <span key={i} style={{ fontSize: 9, color: C.sub }}>{p.label}</span>
                    ))}
                  </div>
                </>
              : <div style={{ textAlign: 'center', color: C.sub, fontSize: 12, padding: '16px 0' }}>至少需要 2 個月的資料</div>
          }
        </div>
      )}
    </div>
  );
}

// 舊的 ElecCharts 保留為空（避免 undefined 錯誤）
function ElecCharts({ data, year, month, monthlyTotals, monthlyLoading, onOpen }) {
  return null; // 已拆成 DailyChart 和 YearlyChart
}

// 輸入 Modal
function ElecInputModal({ date, currentReading, onSave, onDelete, onClose }) {
  const [value, setValue] = useState(currentReading != null ? String(currentReading) : "");
  const dateLabel = new Date(date+"T00:00:00").toLocaleDateString("zh-TW",{month:"long",day:"numeric",weekday:"long"});

  function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    onSave(Math.round(num * 10) / 10);
  }

  return ReactDOM.createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.2)" }}
      onClick={onClose}>
      <div className="pop-in" onClick={e=>e.stopPropagation()}
        style={{ background:C.card, borderRadius:20, padding:24, boxShadow:"0 8px 40px rgba(0,0,0,0.15)", width:260, margin:20 }}>
        <div style={{ fontSize:13, color:C.sub, marginBottom:4, textAlign:"center" }}>{dateLabel}</div>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:20, textAlign:"center" }}>記錄電表度數</div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
          <input
            type="number" inputMode="decimal" step="0.1" min="0"
            value={value} onChange={e=>setValue(e.target.value)}
            placeholder="12345.6"
            autoFocus
            onKeyDown={e=>e.key==="Enter"&&handleSave()}
            style={{ flex:1, minWidth:0, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 12px", fontSize:18, color:C.text, background:C.bg, outline:"none", textAlign:"center", fontFamily:"'Noto Serif TC',serif", fontWeight:700, }}
          />
          <div style={{ fontSize:16, color:C.sub, fontWeight:600 }}>度</div>
        </div>

        <div style={{ display:"flex", gap:8 }}>
          {currentReading != null && (
            <button onClick={onDelete}
              style={{ flex:1, padding:"11px 0", borderRadius:12, border:`1.5px solid ${C.red}`, background:"none", color:C.red, fontSize:14, cursor:"pointer", fontWeight:600 }}>
              刪除
            </button>
          )}
          <button onClick={handleSave}
            style={{ flex:2, padding:"11px 0", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:14, cursor:"pointer", fontWeight:600, opacity:!value||isNaN(parseFloat(value))?0.5:1 }}>
            儲存
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Electricity App ─────────────────────────────────────────────
function ElectricityApp({ user, token, saving, setSaving, partnerVersion }) {
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState({}); // { "YYYY-MM-DD": 度數 }
  const [loaded, setLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [partner, setPartner] = useState(undefined);
  const [monthlyTotals, setMonthlyTotals] = useState([]); // [{label, total}]
  const [monthlyLoading, setMonthlyLoading] = useState(false);
  const timer = useRef(null);
  const loadCancelRef = useRef(0); // 用來取消過期的 loadMonthlyTotals

  const SHEET = "electricity";

  // 有夥伴用 sharedToken 當 key，無夥伴用自己的 user
  const dataOwner = (partner && window._SHARED_TOKEN) ? window._SHARED_TOKEN : user;
  const KEY = `${dataOwner}_${year}_${month}`;

  function sharedParams() {
    return {
      user: "_shared",
      sheet: SHEET,
      token,
      sharedToken: window._SHARED_TOKEN || "",
      apiUser: window._API_USER || user,
    };
  }

  // 初始載入 partner（共用記帳夥伴）
  useEffect(() => {
    if (`${user}:budget_partner:partner` in (window._CACHE || {})) {
      setPartner(window._CACHE[`${user}:budget_partner:partner`] || "");
      return;
    }
    apiCall({ action:"getBudgetPartner", user, token }).then(val => {
      const p = (val && String(val).trim() && String(val) !== "null") ? String(val).trim() : "";
      cacheSet(user, "budget_partner", "partner", p);
      setPartner(p);
    });
  }, []);

  // 夥伴關係改變時更新
  useEffect(() => {
    if (partnerVersion === 0) return;
    const newPartner = window._CACHE?.[`${user}:budget_partner:partner`] ?? "";
    setPartner(newPartner);
    setData({});
    setLoaded(false);
  }, [partnerVersion]);

  useEffect(() => {
    if (partner === undefined) return;
    if (cacheHas("_shared", SHEET, KEY)) {
      const cached = cacheGet("_shared", SHEET, KEY);
      try { setData(cached ? JSON.parse(cached) : {}); } catch { setData({}); }
      setLoaded(true);
      return;
    }
    setLoaded(false);
    apiCall({ ...sharedParams(), action:"readOne", key:KEY }).then(val => {
      const str = typeof val === "string" ? val : JSON.stringify(val || {});
      cacheSet("_shared", SHEET, KEY, str);
      try {
        if (!val) setData({});
        else if (typeof val === "object" && !Array.isArray(val)) setData(val);
        else setData(JSON.parse(val));
      } catch { setData({}); }
      setLoaded(true);
    });
  }, [year, month, partner]);

  // 載入近 6 個月總用電（展開圖表時呼叫）
  // 載入當年 1-12 月總用電
  async function loadMonthlyTotals() {
    const myToken = ++loadCancelRef.current;
    setMonthlyLoading(true);
    setMonthlyTotals([]);
    const results = [];
    for (let m = 1; m <= 12; m++) {
      if (loadCancelRef.current !== myToken) return;
      const owner = (partner && window._SHARED_TOKEN) ? window._SHARED_TOKEN : user;
      const k = `${owner}_${year}_${m}`;
      const label = `${m}月`;
      let monthData = null;
      if (cacheHas("_shared", SHEET, k)) {
        const cached = cacheGet("_shared", SHEET, k);
        try { monthData = cached ? JSON.parse(cached) : {}; } catch { monthData = {}; }
      } else {
        const val = await apiCall({ ...sharedParams(), action:"readOne", key:k });
        if (loadCancelRef.current !== myToken) return;
        const str = typeof val === "string" ? val : JSON.stringify(val || {});
        cacheSet("_shared", SHEET, k, str);
        try { monthData = val ? (typeof val === "object" ? val : JSON.parse(val)) : {}; } catch { monthData = {}; }
      }
      const prefix = `${year}-${String(m).padStart(2,'0')}`;
      const mReadings = Object.keys(monthData || {}).filter(kk => kk.startsWith(prefix) && monthData[kk] != null).sort();
      let total = null;
      if (mReadings.length > 0) {
        const last = monthData[mReadings[mReadings.length - 1]];
        const allKeys = Object.keys(monthData || {}).filter(kk => monthData[kk] != null).sort();
        const prevKeys = allKeys.filter(kk => kk < mReadings[0]);
        const startVal = prevKeys.length > 0 ? monthData[prevKeys[prevKeys.length - 1]] : monthData[mReadings[0]];
        const t = Math.round((last - startVal) * 10) / 10;
        if (t >= 0) total = t;
      }
      results.push({ label, total });
    }
    if (loadCancelRef.current !== myToken) return;
    setMonthlyTotals(results);
    setMonthlyLoading(false);
  }

  // 年份或夥伴變更時重新載入每月總計（直接呼叫，不管圖表是否展開）
  useEffect(() => {
    loadMonthlyTotals();
  }, [year, partner]);

  function save(next) {
    setData(next);
    cacheSet("_shared", SHEET, KEY, JSON.stringify(next));
    setSaving(p => ({...p, electricity:true}));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await apiCall({ ...sharedParams(), action:"writeOne", key:KEY, value:JSON.stringify(next) });
      setSaving(p => ({...p, electricity:false}));
    }, 1500);
  }

  function handleSave(reading) {
    save({ ...data, [selectedDate]: reading });
    setSelectedDate(null);
  }

  function handleDelete() {
    const next = { ...data };
    delete next[selectedDate];
    save(next);
    setSelectedDate(null);
  }

  // 計算每日用電量（今日 - 前一天的度數差）
  const daysCount = DAYS_IN_MONTH_E(month, year);

  // 建立有序的日期清單
  const dailyUsage = {}; // { "YYYY-MM-DD": 用電量（已攤分）}
  const sortedDates = Object.keys(data).filter(k => data[k] != null).sort();

  for (let i = 1; i < sortedDates.length; i++) {
    const curr = sortedDates[i];
    const prev = sortedDates[i - 1];
    const totalDiff = Math.round((data[curr] - data[prev]) * 10) / 10;
    if (totalDiff < 0) continue;

    // 計算兩筆之間隔了幾天
    const daysBetween = Math.round((new Date(curr) - new Date(prev)) / 86400000);
    const perDay = Math.round((totalDiff / daysBetween) * 10) / 10;

    // 把每天都填上平均值
    for (let d = 1; d <= daysBetween; d++) {
      const date = new Date(new Date(prev).getTime() + d * 86400000);
      const dateKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      dailyUsage[dateKey] = perDay;
    }
  }

  // 本月統計
  const readings = Object.keys(data)
    .filter(k => data[k] != null)
    .sort();

  // 本月第一筆和最後一筆（在本月範圍內）
  const monthPrefix = `${year}-${String(month).padStart(2,'0')}`;
  const monthReadings = readings.filter(k => k.startsWith(monthPrefix));

  // 月用電量：找本月第一筆之前的上一筆讀數（可能在上月）
  let monthTotal = null;
  let monthTotalLabel = null; // 起訖說明
  if (monthReadings.length > 0) {
    const firstInMonth = monthReadings[0];
    const lastInMonth = monthReadings[monthReadings.length - 1];
    const prevReadings = readings.filter(k => k < firstInMonth);
    const startKey = prevReadings.length > 0 ? prevReadings[prevReadings.length - 1] : null;
    const startReading = startKey ? data[startKey] : data[firstInMonth];
    const t = Math.round((data[lastInMonth] - startReading) * 10) / 10;
    if (t >= 0) {
      monthTotal = t;
    }
  }

  const usageValues = Object.values(dailyUsage).filter(v => v > 0);
  const maxDailyUsage = usageValues.length ? Math.max(...usageValues) : 0;
  const avgDailyUsage = usageValues.length
    ? Math.round((usageValues.reduce((a,b)=>a+b,0) / usageValues.length) * 10) / 10
    : null;



  const latestReading = readings.length ? data[readings[readings.length - 1]] : null;

  const firstDay = FIRST_DAY_E(month, year);
  const today = new Date();
  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  function prevMonth() {
    if (month === 1) { setYear(y=>y-1); setMonth(12); }
    else setMonth(m=>m-1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y=>y+1); setMonth(1); }
    else setMonth(m=>m+1);
  }

  return (
    <div style={{ height:"100%", overflowY:"auto", padding:"20px 20px 100px", background:C.bg }}>

      {/* 年度每月用電圖（在月份導航外，不隨月份重置）*/}
      <YearlyChart year={year} monthlyTotals={monthlyTotals} monthlyLoading={monthlyLoading} onOpen={loadMonthlyTotals} />

      {/* 月份導航 */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <button onClick={prevMonth}
          style={{ width:36, height:36, borderRadius:18, background:C.card, border:`1.5px solid ${C.border}`, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, color:C.sub }}>{year}</div>
          <div style={{ fontSize:22, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text }}>{MONTHS_E[month-1]}</div>
        </div>
        <button onClick={nextMonth}
          style={{ width:36, height:36, borderRadius:18, background:C.card, border:`1.5px solid ${C.border}`, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
      </div>

      {/* 最新讀數卡 */}
      <div style={{ background:C.card, borderRadius:16, padding:"14px 16px", marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ flex:1 }}>
            {latestReading != null ? (
              <>
                <div style={{ fontSize:11, color:C.sub, marginBottom:2 }}>目前電表讀數</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:6 }}>
                  <span style={{ fontSize:28, fontWeight:700, color:C.accent, fontFamily:"'Noto Serif TC',serif" }}>{latestReading}</span>
                  <span style={{ fontSize:14, color:C.sub }}>度</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize:13, color:C.sub }}>點擊日期記錄電表度數</div>
            )}
          </div>
          {monthTotal != null && (
            <div style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"8px 12px", textAlign:"center", flexShrink:0 }}>
              <div style={{ fontSize:11, color:C.sub }}>本月用電</div>
              <div style={{ fontSize:16, fontWeight:700, color:C.text }}>{monthTotal} 度</div>
            </div>
          )}
        </div>
      </div>

      {/* 統計卡 */}
      {usageValues.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:10, marginBottom:14 }}>
          {[
            { label:"日均用電", value: avgDailyUsage != null ? `${avgDailyUsage} 度` : "—", color:"#4A7C59" },
            { label:"單日最高", value: maxDailyUsage ? `${maxDailyUsage} 度` : "—", color:"#D0533A" },
          ].map(s => (
            <div key={s.label} style={{ background:C.card, borderRadius:14, padding:"12px 10px", textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:14, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 當月每日用電折線圖 */}
      <DailyChart data={data} year={year} month={month} />

      {/* 日曆 */}
      <div style={{ background:C.card, borderRadius:16, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        {/* 星期標題 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:8 }}>
          {["日","一","二","三","四","五","六"].map(d => (
            <div key={d} style={{ textAlign:"center", fontSize:11, color:C.sub, fontWeight:500, padding:"4px 0" }}>{d}</div>
          ))}
        </div>

        {/* 說明 */}
        <div style={{ fontSize:11, color:C.sub, textAlign:"center", marginBottom:10 }}>
          格子內顯示當日用電量（與前一天的差值）
        </div>

        {/* 日期格子 */}
        {!loaded ? (
          <div style={{ padding:24, display:"flex", justifyContent:"center" }}>
            <div style={{ width:28, height:28, borderRadius:14, border:`3px solid ${C.border}`, borderTopColor:C.accent, animation:"spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
            {Array(firstDay).fill(null).map((_,i) => <div key={"e"+i} />)}
            {Array(daysCount).fill(null).map((_,i) => {
              const day = i + 1;
              const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const hasReading = data[dateKey] != null;
              const usage = dailyUsage[dateKey];
              const isEstimated = !hasReading && usage != null;
              const isMax = hasReading && usage != null && usage === maxDailyUsage && maxDailyUsage > 0;
              const { bg, text } = hasReading && usage != null
                ? getElecColor(usage, maxDailyUsage)
                : hasReading
                  ? { bg: "#EAF2EC", text: "#4A7C59" }
                  : { bg: C.bg, text: C.sub };
              const isToday = isCurrentMonth && day === today.getDate();

              return (
                <button key={day} onClick={() => setSelectedDate(dateKey)}
                  style={{ aspectRatio:"1", borderRadius:10, border:`1.5px solid ${isToday?C.accent:hasReading?"transparent":C.border}`, background:hasReading?bg:C.bg, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, padding:2, transition:"all 0.15s" }}>
                  <span style={{ fontSize:10, color:isToday?C.accent:C.sub, fontWeight:isToday?700:400 }}>{day}</span>
                  {hasReading && usage != null && (
                    <span style={{ fontSize:9, fontWeight:700, color:text, lineHeight:1 }}>{usage}</span>
                  )}
                  {hasReading && usage == null && (
                    <span style={{ fontSize:8, color:"#4A7C59", lineHeight:1 }}>●</span>
                  )}
                  {isEstimated && (
                    <span style={{ fontSize:8, color:C.sub, lineHeight:1 }}>~{usage}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {Object.keys(data).length === 0 && loaded && (
          <div style={{ textAlign:"center", padding:"16px 0 8px", color:C.sub, fontSize:13 }}>點擊日期記錄電表度數</div>
        )}
      </div>

      {/* 輸入 Modal */}
      {selectedDate && (
        <ElecInputModal
          date={selectedDate}
          currentReading={data[selectedDate] != null ? data[selectedDate] : null}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
