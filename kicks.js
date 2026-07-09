// ── kicks.js ───────────────────────────────────────────────
// 胎動紀錄模組
// 資料以「月」為單位打包成一筆文件讀寫（跟 weight.js 同一個模式），
// 避免每次按按鈕都各自寫一筆，減少 Firestore 讀寫次數。
// 文件格式： sheet="kicks", key=`${year}_${month}`,
//           value = JSON.stringify({ "YYYY-MM-DD": [ms, ms, ...] })

const WEEKDAYS_K = ["日","一","二","三","四","五","六"];
const padK = n => String(n).padStart(2, "0");

function toDateKeyK(d) { return `${d.getFullYear()}-${padK(d.getMonth()+1)}-${padK(d.getDate())}`; }
function formatTimeK(ms) { const d = new Date(ms); return `${padK(d.getHours())}:${padK(d.getMinutes())}:${padK(d.getSeconds())}`; }
function shiftDateKeyK(dateKey, deltaDays) {
  const [y,m,d] = dateKey.split("-").map(Number);
  const date = new Date(y, m-1, d);
  date.setDate(date.getDate() + deltaDays);
  return toDateKeyK(date);
}
function monthKeyK(y, m) { return `${y}_${m}`; }
function ymOf(dateKey) { const [y,m] = dateKey.split("-").map(Number); return { y, m }; }
function minutesAgoLabelK(ms) {
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 1) return "剛剛";
  if (mins < 60) return `${mins} 分鐘前`;
  return `${Math.floor(mins/60)} 小時 ${mins%60} 分前`;
}
function formatDateLabelK(dateKey, todayKey) {
  const [y,m,d] = dateKey.split("-").map(Number);
  const wd = WEEKDAYS_K[new Date(y,m-1,d).getDay()];
  const label = `${m}/${d}（週${wd}）`;
  return dateKey===todayKey ? `今天 ${label}` : label;
}

function getPeriodDatesK(mode, anchor) {
  if (mode === "day") return [anchor];
  if (mode === "week") {
    const [y,m,d] = anchor.split("-").map(Number);
    const date = new Date(y,m-1,d);
    const offset = (date.getDay()+6)%7; // 週一為一週開始
    const monday = new Date(date); monday.setDate(date.getDate()-offset);
    const dates = [];
    for (let i=0;i<7;i++){ const dd=new Date(monday); dd.setDate(monday.getDate()+i); dates.push(toDateKeyK(dd)); }
    return dates;
  }
  // month
  const [y,m] = anchor.split("-").map(Number);
  const last = new Date(y,m,0).getDate();
  const dates = [];
  for (let dd=1; dd<=last; dd++) dates.push(toDateKeyK(new Date(y,m-1,dd)));
  return dates;
}
function periodLabelK(mode, anchor, dates, todayKey) {
  if (mode === "day") return formatDateLabelK(anchor, todayKey);
  if (mode === "week") {
    const [,m1,d1] = dates[0].split("-").map(Number);
    const [,m2,d2] = dates[dates.length-1].split("-").map(Number);
    return `${m1}/${d1} - ${m2}/${d2}`;
  }
  const [y,m] = anchor.split("-").map(Number);
  return `${y}年${m}月`;
}
function shiftAnchorK(mode, anchor, delta) {
  if (mode === "day") return shiftDateKeyK(anchor, delta);
  if (mode === "week") return shiftDateKeyK(anchor, delta*7);
  const [y,m,d] = anchor.split("-").map(Number);
  return toDateKeyK(new Date(y, m-1+delta, 1));
}
function getHourlyAggregateK(days, dates) {
  const buckets = Array.from({length:24}, (_,h)=>({hour:h, count:0}));
  dates.forEach(dk => (days[dk]||[]).forEach(ts => { buckets[new Date(ts).getHours()].count += 1; }));
  return buckets;
}
function getDailyTotalsK(days, dates, todayKey) {
  return dates.map(dk => {
    const [,m,d] = dk.split("-").map(Number);
    return { dateKey: dk, label: `${m}/${d}`, count: (days[dk]||[]).length, isToday: dk===todayKey };
  });
}
function getPeriodStatsK(days, dates) {
  const totals = dates.map(dk => (days[dk]||[]).length);
  const total = totals.reduce((a,b)=>a+b, 0);
  const daysRecorded = totals.filter(c=>c>0).length;
  return {
    total, daysRecorded, totalDays: dates.length,
    avgAll: dates.length ? (total/dates.length).toFixed(1) : "0.0",
  };
}

// ── 純 CSS 長條圖 ──────────────────────────────────────────
function KicksBarChart({ items, trackHeight=110 }) {
  const maxVal = Math.max(1, ...items.map(it=>it.value));
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:4, paddingTop:8, overflowX:"auto" }}>
      {items.map((it, i) => {
        const h = it.value>0 ? Math.max(6, (it.value/maxVal)*trackHeight) : 2;
        return (
          <div key={i} style={{ flex:1, minWidth:14, display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ fontSize:9, color:C.sub, marginBottom:2, minHeight:11 }}>{it.value>0?it.value:""}</div>
            <div style={{ height:trackHeight, width:"100%", display:"flex", alignItems:"flex-end", justifyContent:"center" }}>
              <div title={`${it.label}：${it.value} 次`} style={{ width:"100%", maxWidth:26, borderRadius:"5px 5px 0 0",
                height:h, background: it.value>0 ? (it.isToday ? C.accent : (it.other ? "#B8A6D9" : C.accent)) : "#EDE7E2",
                transition:"height .2s ease" }} />
            </div>
            <div style={{ fontSize:9.5, color:C.sub, marginTop:6, whiteSpace:"nowrap" }}>{it.label}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── 24 小時時段圓點 ────────────────────────────────────────
function KicksTimeline({ hourlyData }) {
  const maxCount = Math.max(1, ...hourlyData.map(b=>b.count));
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8, fontSize:11, color:C.sub }}>
        <span>🌙 00:00</span>
        <span style={{ fontSize:12.5, fontWeight:700, color:C.accent }}>時段分布</span>
        <span>24:00 ☀️</span>
      </div>
      <div style={{ display:"flex", alignItems:"flex-end", height:46, gap:2 }}>
        {hourlyData.map(b => {
          let bg = "#EDE7E2", size = 5, opacity = 0.8;
          if (b.count > 0) {
            size = 11; opacity = 1;
            const ratio = maxCount>1 ? b.count/maxCount : 1;
            const r = Math.round(234 - (234-74)*ratio), g = Math.round(242 - (242-124)*ratio), bl = Math.round(236 - (236-89)*ratio);
            bg = `rgb(${r},${g},${bl})`;
          }
          return (
            <div key={b.hour} style={{ flex:1, display:"flex", justifyContent:"center", alignItems:"flex-end", height:46 }}>
              <div title={`${b.hour}時：${b.count} 次`} style={{ width:size, height:size, borderRadius:"50%", background:bg, opacity }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KicksSection({ user, token, saving, setSaving }) {
  const SHEET = "kicks";
  const todayKey = toDateKeyK(new Date());

  const [viewMode, setViewMode] = useState("day"); // day | week | month
  const [anchorDate, setAnchorDate] = useState(todayKey);
  const [days, setDays] = useState({});             // 合併後的資料 { "YYYY-MM-DD": [ms,...] }
  const [initialLoaded, setInitialLoaded] = useState(false);
  const [periodLoading, setPeriodLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [toast, setToast] = useState("");
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [manualDate, setManualDate] = useState(todayKey);
  const [manualTime, setManualTime] = useState(() => { const d=new Date(); return `${padK(d.getHours())}:${padK(d.getMinutes())}`; });
  const loadedMonthsRef = useRef(new Set());
  const daysRef = useRef({});
  const saveTimerRef = useRef(null);
  const toastTimerRef = useRef(null);

  useEffect(() => { daysRef.current = days; }, [days]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  function showToast(msg) {
    setToast(msg);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(""), 1800);
  }

  async function ensureMonth(y, m) {
    const mk = monthKeyK(y, m);
    if (loadedMonthsRef.current.has(mk)) return;
    loadedMonthsRef.current.add(mk);
    let val = {};
    if (cacheHas(user, SHEET, mk)) {
      try { val = JSON.parse(cacheGet(user, SHEET, mk) || "{}"); } catch { val = {}; }
    } else {
      const raw = await apiCall({ action:"readOne", user, sheet:SHEET, key:mk, token });
      try {
        val = !raw ? {} : (typeof raw === "object" && !Array.isArray(raw) ? raw : JSON.parse(raw));
      } catch { val = {}; }
      cacheSet(user, SHEET, mk, JSON.stringify(val));
    }
    setDays(prev => ({ ...prev, ...val }));
  }

  // 依目前檢視模式 / 錨點日期，載入所需的月份
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPeriodLoading(true);
      const dates = getPeriodDatesK(viewMode, anchorDate);
      const months = new Set(dates.map(dk => { const {y,m} = ymOf(dk); return monthKeyK(y,m); }));
      await Promise.all([...months].map(mk => { const [y,m] = mk.split("_").map(Number); return ensureMonth(y,m); }));
      if (!cancelled) { setPeriodLoading(false); setInitialLoaded(true); }
    })();
    return () => { cancelled = true; };
  }, [viewMode, anchorDate]);

  function persistMonth(y, m, updatedDays) {
    const mk = monthKeyK(y, m);
    const prefix = `${y}-${padK(m)}-`;
    const obj = {};
    Object.keys(updatedDays).forEach(dk => { if (dk.startsWith(prefix) && (updatedDays[dk]||[]).length) obj[dk] = updatedDays[dk]; });
    cacheSet(user, SHEET, mk, JSON.stringify(obj));
    setSaving(p => ({ ...p, kicks:true }));
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      await writeOne(user, SHEET, mk, JSON.stringify(obj), token);
      setSaving(p => ({ ...p, kicks:false }));
    }, 1200);
  }

  function handleRecord() {
    const ts = Date.now();
    const d = new Date();
    const next = { ...daysRef.current, [todayKey]: [...(daysRef.current[todayKey]||[]), ts].sort((a,b)=>a-b) };
    setDays(next);
    persistMonth(d.getFullYear(), d.getMonth()+1, next);
    if (anchorDate !== todayKey) setAnchorDate(todayKey);
    showToast(`已記錄 ${formatTimeK(ts)}`);
  }

  function handleUndo() {
    const arr = daysRef.current[todayKey] || [];
    if (arr.length === 0) return;
    const d = new Date();
    const next = { ...daysRef.current, [todayKey]: arr.slice(0,-1) };
    setDays(next);
    persistMonth(d.getFullYear(), d.getMonth()+1, next);
    showToast("已撤銷上一筆");
  }

  function handleManualAdd(dateStr, timeStr) {
    if (!dateStr || !timeStr) { showToast("請填寫日期與時間"); return; }
    const ts = new Date(`${dateStr}T${timeStr}:00`).getTime();
    if (isNaN(ts)) { showToast("時間格式不正確"); return; }
    const { y, m } = ymOf(dateStr);
    const next = { ...daysRef.current, [dateStr]: [...(daysRef.current[dateStr]||[]), ts].sort((a,b)=>a-b) };
    setDays(next);
    persistMonth(y, m, next);
    if (anchorDate !== dateStr) setAnchorDate(dateStr);
    showToast(`已新增 ${dateStr} ${timeStr}`);
  }

  function handleDeleteEntry(dateKey, ts) {
    const { y, m } = ymOf(dateKey);
    const next = { ...daysRef.current, [dateKey]: (daysRef.current[dateKey]||[]).filter(t=>t!==ts) };
    setDays(next);
    persistMonth(y, m, next);
  }

  function handleClearDay(dateKey) {
    const { y, m } = ymOf(dateKey);
    const next = { ...daysRef.current, [dateKey]: [] };
    setDays(next);
    persistMonth(y, m, next);
    showToast("已清空當天紀錄");
  }

  const todayList = (days[todayKey] || []).slice().sort((a,b)=>a-b);
  const lastTs = todayList.length ? todayList[todayList.length-1] : null;
  const count1h = todayList.filter(t => now-t <= 3600000).length;
  const count2h = todayList.filter(t => now-t <= 7200000).length;

  const periodDates = getPeriodDatesK(viewMode, anchorDate);
  const pStats = getPeriodStatsK(days, periodDates);
  const hourlyData = getHourlyAggregateK(days, periodDates);
  const activeHours = hourlyData.filter(b=>b.count>0);
  let minH = 7, maxH = 22;
  if (activeHours.length) {
    minH = Math.max(0, Math.min(...activeHours.map(b=>b.hour))-1);
    maxH = Math.min(23, Math.max(...activeHours.map(b=>b.hour))+1);
  }
  const hourlyDisplay = hourlyData.filter(b => b.hour>=minH && b.hour<=maxH);
  const dailyTotals = getDailyTotalsK(days, periodDates, todayKey);
  const canGoNext = periodDates[periodDates.length-1] < todayKey;

  let analysisText;
  if (todayList.length === 0) {
    analysisText = "今天還沒有紀錄。感覺到胎動時，點一下上方的按鈕即可。";
  } else {
    const parts = [`今天目前共記錄 ${todayList.length} 次胎動。`];
    if (count2h>0) parts.push(`最近 2 小時內有 ${count2h} 次。`);
    analysisText = parts.join(" ");
  }

  const card = { background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:"14px 16px 10px" };
  const statCard = { background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:"12px 8px", textAlign:"center" };

  if (!initialLoaded) return <Spinner />;

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
        <SaveDot saving={!!saving.kicks} />
      </div>

      <div>

        {/* 記錄按鈕 */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
          <button onClick={handleRecord} style={{
            width:140, height:140, borderRadius:"50%", border:"none", cursor:"pointer",
            background:`linear-gradient(145deg, ${C.accent}, #3d6b4c)`, color:"#fff",
            display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
            boxShadow:"0 10px 22px rgba(74,124,89,0.35)",
          }}>
            <div style={{ fontSize:26 }}>💗</div>
            <div style={{ fontSize:14, fontWeight:700, marginTop:6 }}>記錄胎動</div>
          </button>
          <div style={{ marginTop:16, textAlign:"center" }}>
            <div style={{ fontSize:38, fontWeight:700, color:C.text }}>{todayList.length}</div>
            <div style={{ fontSize:13, color:C.sub }}>今天累計次數</div>
          </div>
          {lastTs && (
            <button onClick={handleUndo} style={{ marginTop:12, display:"inline-flex", alignItems:"center", gap:6,
              background:"none", border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"6px 14px", fontSize:12.5, cursor:"pointer" }}>
              ↩ 撤銷上一筆（{formatTimeK(lastTs)}）
            </button>
          )}

          {!showManualEntry ? (
            <button onClick={()=>{ setManualDate(anchorDate); setShowManualEntry(true); }}
              style={{ marginTop:10, background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer", textDecoration:"underline", textUnderlineOffset:2 }}>
              ✏️ 手動輸入時間
            </button>
          ) : (
            <div className="pop-in" style={{ marginTop:12, background:C.card, border:`1px solid ${C.border}`, borderRadius:14, padding:12, display:"flex", flexDirection:"column", gap:8, width:"100%", maxWidth:280 }}>
              <div style={{ display:"flex", gap:8 }}>
                <input type="date" value={manualDate} max={todayKey} onChange={e=>setManualDate(e.target.value)}
                  style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"8px 10px", fontSize:13, outline:"none", background:C.bg, color:C.text }} />
                <input type="time" value={manualTime} onChange={e=>setManualTime(e.target.value)}
                  style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"8px 10px", fontSize:13, outline:"none", background:C.bg, color:C.text }} />
              </div>
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setShowManualEntry(false)}
                  style={{ flex:1, background:"none", border:`1px solid ${C.border}`, color:C.sub, borderRadius:10, padding:"8px 0", fontSize:13, cursor:"pointer" }}>
                  取消
                </button>
                <button onClick={()=>{ handleManualAdd(manualDate, manualTime); setShowManualEntry(false); }}
                  style={{ flex:1, background:C.accent, border:"none", color:"#fff", borderRadius:10, padding:"8px 0", fontSize:13, fontWeight:600, cursor:"pointer" }}>
                  新增
                </button>
              </div>
            </div>
          )}
          {toast && (
            <div className="fade-in" style={{ marginTop:12, background:C.text, color:"#fff", padding:"6px 16px", borderRadius:20, fontSize:13 }}>
              {toast}
            </div>
          )}
        </div>

        {/* 今日即時狀態 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:24 }}>
          <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{lastTs?minutesAgoLabelK(lastTs):"—"}</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>距上次</div></div>
          <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{count1h} 次</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>近 1 小時</div></div>
          <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{count2h} 次</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>近 2 小時</div></div>
        </div>

        <div style={{ ...card, marginTop:14, fontSize:12.5, color:"#7a7a7a", lineHeight:1.6 }}>
          <div>{analysisText}</div>
          <div style={{ marginTop:6, color:C.sub }}>
            參考資訊：安靜狀態下 2 小時內感受到 10 次以上胎動，是常見的一般性參考範圍；若感覺胎動明顯減少或有任何疑慮，請直接聯繫產檢醫師，不要以此工具的紀錄自行判斷。
          </div>
        </div>

        {/* 日／週／月 切換 */}
        <div style={{ display:"flex", justifyContent:"center", gap:6, marginTop:26 }}>
          {[["day","日"],["week","週"],["month","月"]].map(([mode,label]) => (
            <button key={mode} onClick={()=>setViewMode(mode)} style={{
              border:`1px solid ${C.border}`, background: viewMode===mode ? C.accent : C.card,
              color: viewMode===mode ? "#fff" : C.sub, fontSize:13, padding:"6px 18px", borderRadius:20, cursor:"pointer" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:14, marginTop:14 }}>
          <button onClick={()=>setAnchorDate(shiftAnchorK(viewMode, anchorDate, -1))}
            style={{ width:32, height:32, borderRadius:16, border:`1px solid ${C.border}`, background:C.card, color:C.sub, cursor:"pointer" }}>←</button>
          <div style={{ fontSize:14.5, fontWeight:600, color:C.text, minWidth:150, textAlign:"center" }}>
            {periodLabelK(viewMode, anchorDate, periodDates, todayKey)}
          </div>
          <button disabled={!canGoNext} onClick={()=>canGoNext && setAnchorDate(shiftAnchorK(viewMode, anchorDate, 1))}
            style={{ width:32, height:32, borderRadius:16, border:`1px solid ${C.border}`, background:C.card, color:canGoNext?C.sub:"#ddd", cursor:canGoNext?"pointer":"default" }}>→</button>
        </div>

        {/* 期間統計 */}
        {viewMode==="day" ? (
          <div style={{ maxWidth:220, margin:"14px auto 0" }}>
            <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{pStats.total} 次</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>這天總次數</div></div>
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginTop:14 }}>
            <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{pStats.total} 次</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>期間總次數</div></div>
            <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{pStats.avgAll} 次</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>每日平均</div></div>
            <div style={statCard}><div style={{ fontSize:14, fontWeight:700, color:C.text }}>{pStats.daysRecorded} / {pStats.totalDays}</div><div style={{ fontSize:10.5, color:C.sub, marginTop:2 }}>有紀錄天數</div></div>
          </div>
        )}

        {periodLoading ? <Spinner /> : (
          <>
            {/* 時段分布 */}
            <div style={{ ...card, marginTop:20 }}>
              <KicksTimeline hourlyData={hourlyData} />
            </div>

            {/* 每小時 / 每日 長條圖 */}
            <div style={{ marginTop:20 }}>
              <div style={{ fontSize:12.5, fontWeight:700, color:C.accent, letterSpacing:1, marginBottom:8 }}>
                {viewMode==="day" ? "當日每小時次數分布" : viewMode==="week" ? "本週每小時次數分布（加總）" : "本月每小時次數分布（加總）"}
              </div>
              <div style={card}>
                {activeHours.length===0
                  ? <div style={{ padding:"30px 0", textAlign:"center", color:C.sub, fontSize:13 }}>這段時間還沒有紀錄</div>
                  : <KicksBarChart items={hourlyDisplay.map(b=>({ label:`${b.hour}時`, value:b.count }))} />}
              </div>
            </div>

            {viewMode!=="day" && (
              <div style={{ marginTop:20 }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:C.accent, letterSpacing:1, marginBottom:8 }}>
                  {viewMode==="week" ? "本週各日次數" : "本月各日次數"}
                </div>
                <div style={card}>
                  <KicksBarChart items={dailyTotals.map(d=>({ label:d.label, value:d.count, isToday:d.isToday }))} />
                </div>
              </div>
            )}

            {/* 清單 */}
            <div style={{ marginTop:20 }}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize:12.5, fontWeight:700, color:C.accent, letterSpacing:1, marginBottom:8 }}>
                  {viewMode==="day" ? "時間清單" : viewMode==="week" ? "每日紀錄（本週）" : "每日紀錄（本月）"}
                </div>
                {viewMode==="day" && todayList.length>=0 && (days[anchorDate]||[]).length>0 && (
                  <button onClick={()=>handleClearDay(anchorDate)} style={{ background:"none", border:"none", color:C.sub, fontSize:12, cursor:"pointer" }}>🗑 清空這天</button>
                )}
              </div>

              <div style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:16, overflow:"hidden" }}>
                {viewMode==="day" ? (
                  (days[anchorDate]||[]).length===0 ? (
                    <div style={{ padding:24, textAlign:"center", color:C.sub, fontSize:13 }}>
                      {anchorDate===todayKey ? "還沒有紀錄，感覺到胎動時點一下上方按鈕吧" : "這天沒有紀錄"}
                    </div>
                  ) : (
                    (days[anchorDate]||[]).slice().sort((a,b)=>b-a).map((ts, idx, arr) => (
                      <div key={ts} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", borderTop: idx===0?"none":`1px solid ${C.border}` }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                          <span style={{ fontSize:11, color:C.sub, width:22, display:"inline-block" }}>{arr.length-idx}</span>
                          <span style={{ fontSize:15, color:C.text, fontWeight:600 }}>{formatTimeK(ts)}</span>
                        </div>
                        <button onClick={()=>handleDeleteEntry(anchorDate, ts)} style={{ background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:14 }}>🗑</button>
                      </div>
                    ))
                  )
                ) : (
                  !periodDates.some(dk => (days[dk]||[]).length>0) ? (
                    <div style={{ padding:24, textAlign:"center", color:C.sub, fontSize:13 }}>這段期間沒有紀錄</div>
                  ) : (
                    periodDates.slice().reverse().map(dk => {
                      const list = (days[dk]||[]).slice().sort((a,b)=>a-b);
                      const [,m,d] = dk.split("-").map(Number);
                      const wd = WEEKDAYS_K[new Date(dk.split("-")[0], m-1, d).getDay()];
                      return (
                        <div key={dk} style={{ borderTop:`1px solid ${C.border}` }}>
                          {list.length===0 ? (
                            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px" }}>
                              <div style={{ fontSize:14, color:C.text, fontWeight:600 }}>{m}/{d}（週{wd}）{dk===todayKey?" · 今天":""}</div>
                              <div style={{ fontSize:12.5, color:C.sub }}>0 次</div>
                            </div>
                          ) : (
                            <details>
                              <summary style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 16px", cursor:"pointer", listStyle:"none" }}>
                                <div style={{ fontSize:14, color:C.text, fontWeight:600 }}>{m}/{d}（週{wd}）{dk===todayKey?" · 今天":""}</div>
                                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                                  <span style={{ fontSize:12.5, color:C.sub }}>{list.length} 次</span>
                                  <span style={{ fontSize:11, color:C.sub }}>▾</span>
                                </div>
                              </summary>
                              <div style={{ padding:"0 16px 10px 46px", display:"flex", flexWrap:"wrap", gap:"6px 10px" }}>
                                {list.map(ts => (
                                  <span key={ts} style={{ fontSize:12.5, color:C.text, background:C.accentLight, borderRadius:12, padding:"3px 10px" }}>{formatTimeK(ts)}</span>
                                ))}
                              </div>
                            </details>
                          )}
                        </div>
                      );
                    })
                  )
                )}
              </div>
            </div>
          </>
        )}

        {/* 匯出 */}
        <div style={{ marginTop:24 }}>
          <div style={{ fontSize:12.5, fontWeight:700, color:C.accent, letterSpacing:1, marginBottom:8 }}>匯出</div>
          <div style={{ ...card, display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
            <button onClick={()=>exportMonthReportK(user, token, SHEET, anchorDate, showToast)}
              style={{ background:C.accent, color:"#fff", border:"none", borderRadius:20, padding:"9px 20px", fontSize:13, fontWeight:600, cursor:"pointer" }}>
              📄 匯出本月報表（含圖表）
            </button>
            <button onClick={()=>exportAllCsvK(user, SHEET, token, showToast)}
              style={{ background:C.card, border:`1px solid ${C.border}`, color:C.sub, borderRadius:20, padding:"7px 16px", fontSize:12.5, cursor:"pointer" }}>
              ⬇ 匯出全部原始資料（CSV）
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

// ── 共用：確保拿到某個月完整資料（不依賴目前畫面 state）──────
async function fetchMonthDataK(user, token, sheet, y, m) {
  const mk = monthKeyK(y, m);
  if (cacheHas(user, sheet, mk)) {
    try { return JSON.parse(cacheGet(user, sheet, mk) || "{}"); } catch { return {}; }
  }
  const raw = await apiCall({ action:"readOne", user, sheet, key:mk, token });
  let val = {};
  try { val = !raw ? {} : (typeof raw === "object" && !Array.isArray(raw) ? raw : JSON.parse(raw)); } catch { val = {}; }
  cacheSet(user, sheet, mk, JSON.stringify(val));
  return val;
}

// ── 匯出：全部原始資料 CSV（用 readAll 一次抓整個 sheet，涵蓋所有月份）──
async function exportAllCsvK(user, sheet, token, showToast) {
  showToast("匯出中…");
  const rows = [["日期","時間","星期"]];
  const list = await apiCall({ action:"readAll", user, sheet, token }); // [[monthKey, jsonValue], ...]
  if (!Array.isArray(list) || list.length === 0) { showToast("目前沒有可匯出的紀錄"); return; }
  list.forEach(([, jsonValue]) => {
    let obj = {};
    try { obj = typeof jsonValue === "object" ? jsonValue : JSON.parse(jsonValue || "{}"); } catch { obj = {}; }
    Object.keys(obj).sort().forEach(dk => {
      const [,m,d] = dk.split("-").map(Number);
      const wd = WEEKDAYS_K[new Date(dk.split("-")[0], m-1, d).getDay()];
      (obj[dk]||[]).slice().sort((a,b)=>a-b).forEach(ts => rows.push([dk, formatTimeK(ts), `週${wd}`]));
    });
  });
  if (rows.length === 1) { showToast("目前沒有可匯出的紀錄"); return; }
  const csv = rows.map(r=>r.join(",")).join("\r\n");
  downloadBlobK(new Blob(["\uFEFF"+csv], {type:"text/csv;charset=utf-8;"}), `胎動紀錄_${toDateKeyK(new Date())}.csv`);
  showToast(`已匯出 ${rows.length-1} 筆紀錄`);
}

// ── 匯出：本月報表（含圖表，獨立 HTML 檔）──────────────────
async function exportMonthReportK(user, token, sheet, anchorDate, showToast) {
  const { y, m } = ymOf(anchorDate);
  showToast("產生報表中…");
  const monthData = await fetchMonthDataK(user, token, sheet, y, m); // 直接向該月完整資料，不受目前畫面瀏覽範圍影響
  const dates = getPeriodDatesK("month", anchorDate);
  const hasAny = dates.some(dk => (monthData[dk]||[]).length>0);
  if (!hasAny) { showToast("這個月還沒有任何紀錄"); return; }

  const stats = getPeriodStatsK(monthData, dates);
  const daily = getDailyTotalsK(monthData, dates, toDateKeyK(new Date()));
  const maxVal = Math.max(1, ...daily.map(d=>d.count));

  const barsHtml = daily.map(d => {
    const h = d.count>0 ? Math.max(6, (d.count/maxVal)*140) : 2;
    return `<div class="bar-col"><div class="bar-count">${d.count>0?d.count:""}</div>` +
      `<div class="bar-track"><div class="bar-fill${d.count>0?" active":""}" style="height:${h}px;"></div></div>` +
      `<div class="bar-tick">${d.label}</div></div>`;
  }).join("");

  const tableRows = dates.map(dk => {
    const [,mm,dd] = dk.split("-").map(Number);
    const wd = WEEKDAYS_K[new Date(y,mm-1,dd).getDay()];
    const list = (monthData[dk]||[]).slice().sort((a,b)=>a-b);
    const times = list.map(ts=>formatTimeK(ts)).join("、");
    return `<tr><td>${mm}/${dd}</td><td>週${wd}</td><td style="text-align:center;">${list.length}</td><td class="times">${times||"—"}</td></tr>`;
  }).join("");

  const now = new Date();
  const generatedLabel = `${now.getFullYear()}/${padK(now.getMonth()+1)}/${padK(now.getDate())} ${padK(now.getHours())}:${padK(now.getMinutes())}`;

  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">` +
    `<title>胎動月報表 ${y}-${padK(m)}</title><style>` +
    `body{font-family:-apple-system,BlinkMacSystemFont,"PingFang TC","Noto Sans TC",sans-serif;background:#F7F5F2;color:#1A1A1A;margin:0;padding:28px 16px 48px;}` +
    `.wrap{max-width:640px;margin:0 auto;}h1{font-size:20px;margin:0 0 4px;}` +
    `.meta{font-size:12.5px;color:#9A9A9A;margin-bottom:20px;}` +
    `.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px;}` +
    `.stat{background:#FFF;border:1px solid #EBEBEB;border-radius:14px;padding:12px 8px;text-align:center;}` +
    `.stat b{display:block;font-size:16px;}.stat span{font-size:11px;color:#9A9A9A;}` +
    `.card{background:#FFF;border:1px solid #EBEBEB;border-radius:16px;padding:14px 12px 6px;margin-bottom:20px;overflow-x:auto;}` +
    `.section-title{font-size:12.5px;font-weight:700;color:#4A7C59;letter-spacing:1px;margin-bottom:8px;}` +
    `.bar-chart{display:flex;align-items:flex-end;gap:3px;padding-top:8px;min-width:${dates.length*16}px;}` +
    `.bar-col{flex:1;min-width:13px;display:flex;flex-direction:column;align-items:center;}` +
    `.bar-count{font-size:8.5px;color:#9A9A9A;margin-bottom:2px;min-height:10px;}` +
    `.bar-track{height:140px;width:100%;display:flex;align-items:flex-end;justify-content:center;}` +
    `.bar-fill{width:100%;max-width:20px;border-radius:4px 4px 0 0;background:#EBEBEB;}` +
    `.bar-fill.active{background:#4A7C59;}` +
    `.bar-tick{font-size:8.5px;color:#9A9A9A;margin-top:6px;white-space:nowrap;}` +
    `table{width:100%;border-collapse:collapse;font-size:12.5px;}` +
    `th,td{padding:7px 8px;text-align:left;border-top:1px solid #EBEBEB;}` +
    `th{color:#4A7C59;font-size:11px;font-weight:700;}td.times{color:#7a7a7a;}` +
    `.print-btn{display:inline-block;margin-bottom:16px;background:#4A7C59;color:#fff;border:none;border-radius:20px;padding:8px 18px;font-size:13px;cursor:pointer;}` +
    `@media print{.print-btn{display:none;}}</style></head><body><div class="wrap">` +
    `<button class="print-btn" onclick="window.print()">🖨 列印 / 儲存為 PDF</button>` +
    `<h1>胎動月報表 － ${y}年${m}月</h1><div class="meta">產生時間：${generatedLabel}</div>` +
    `<div class="stats">` +
      `<div class="stat"><b>${stats.total}</b><span>本月總次數</span></div>` +
      `<div class="stat"><b>${stats.avgAll}</b><span>每日平均（全月）</span></div>` +
      `<div class="stat"><b>${stats.daysRecorded} / ${stats.totalDays}</b><span>有紀錄天數</span></div>` +
    `</div>` +
    `<div class="section-title">每日次數分布</div><div class="card"><div class="bar-chart">${barsHtml}</div></div>` +
    `<div class="section-title">每日明細</div><div class="card" style="padding:0;">` +
    `<table><thead><tr><th>日期</th><th>星期</th><th>次數</th><th>紀錄時間</th></tr></thead><tbody>${tableRows}</tbody></table></div>` +
    `</div></body></html>`;

  downloadBlobK(new Blob(["\uFEFF"+html], {type:"text/html;charset=utf-8;"}), `胎動月報表_${y}-${padK(m)}.html`);
  showToast(`已匯出 ${y}年${m}月 報表`);
}

function downloadBlobK(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}