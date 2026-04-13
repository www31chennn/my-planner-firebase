// ── weight.js ──────────────────────────────────────────────
// 體重記錄模組

const { useState, useEffect, useRef } = React;

const MONTHS_W = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const DAYS_IN_MONTH_W = (m,y) => new Date(y,m,0).getDate();
const FIRST_DAY_W = (m,y) => new Date(y,m-1,1).getDay();

// 根據體重在當月範圍內計算顏色
// 最輕 → 淡綠，最重 → 深紅
function getWeightColor(weight, min, max) {
  if (!weight || min === max) return { bg:"#EAF2EC", text:"#4A7C59" };
  const ratio = (weight - min) / (max - min); // 0=最輕, 1=最重
  // 從綠到紅
  const r = Math.round(74 + (208 - 74) * ratio);
  const g = Math.round(124 + (83 - 124) * ratio);
  const b = Math.round(89 + (58 - 89) * ratio);
  const bg = `rgba(${r},${g},${b},0.15)`;
  const text = `rgb(${r},${g},${b})`;
  return { bg, text };
}

// BMI 計算與狀態
function calcBMI(weight, height) {
  if (!weight || !height) return null;
  const h = height / 100; // cm → m
  return Math.round((weight / (h * h)) * 10) / 10;
}

function getBMIStatus(bmi) {
  if (!bmi) return null;
  if (bmi < 18.5) return { label:"過輕", color:"#2C5F8A" };
  if (bmi < 24)   return { label:"正常", color:"#4A7C59" };
  if (bmi < 27)   return { label:"過重", color:"#C4622D" };
  return           { label:"肥胖", color:"#D0533A" };
}

// ── 體重折線圖 ──────────────────────────────────────────────
function WeightLineChart({ data, year, month }) {
  const [open, setOpen] = React.useState(false);
  const daysCount = DAYS_IN_MONTH_W(month, year);
  const points = [];
  for (let d = 1; d <= daysCount; d++) {
    const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    if (data[key]) points.push({ day: d, weight: data[key] });
  }
  if (points.length < 2) return null;

  const W = 320, H = 110, PAD = { top: 16, bottom: 24, left: 36, right: 12 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const weights = points.map(p => p.weight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const range = maxW - minW || 1;

  function xPos(day) { return PAD.left + ((day - 1) / (daysCount - 1)) * chartW; }
  function yPos(w) { return PAD.top + chartH - ((w - minW) / range) * chartH; }

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xPos(p.day)} ${yPos(p.weight)}`).join(' ');
  const areaD = pathD + ` L ${xPos(points[points.length-1].day)} ${PAD.top + chartH} L ${xPos(points[0].day)} ${PAD.top + chartH} Z`;
  const yTicks = [minW, ((minW + maxW) / 2), maxW].map(v => Math.round(v * 10) / 10);

  return (
    <div style={{ background: C.card, borderRadius: 16, marginBottom: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer',
      }}>
        <span style={{ fontSize: 12, color: C.sub, fontWeight: 500 }}>📈 當月趨勢</span>
        <span style={{ fontSize: 12, color: C.sub, transition: 'transform 0.2s', display: 'inline-block', transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }}>▾</span>
      </button>
      {open && (
        <div style={{ padding: '0 16px 14px' }}>
          <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible', display: 'block' }}>
            <defs>
              <linearGradient id="wGrad" x1="0" y1="0" x2="0" y2="1">
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
            <path d={areaD} fill="url(#wGrad)" />
            <path d={pathD} fill="none" stroke={C.accent} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {points.map((p, i) => (
              <g key={i}>
                <circle cx={xPos(p.day)} cy={yPos(p.weight)} r="3.5" fill={C.card} stroke={C.accent} strokeWidth="2" />
                {(p.weight === Math.max(...weights) || p.weight === Math.min(...weights)) && (
                  <text x={xPos(p.day)} y={yPos(p.weight) + (p.weight === Math.min(...weights) ? 13 : -6)}
                    textAnchor="middle" fontSize="9" fill={p.weight === Math.max(...weights) ? '#D0533A' : '#4A7C59'} fontWeight="700">
                    {p.weight}
                  </text>
                )}
              </g>
            ))}
            <text x={PAD.left} y={H - 4} textAnchor="middle" fontSize="9" fill={C.sub}>1</text>
            <text x={W - PAD.right} y={H - 4} textAnchor="middle" fontSize="9" fill={C.sub}>{daysCount}</text>
          </svg>
        </div>
      )}
    </div>
  );
}


function WeightInputModal({ date, currentWeight, onSave, onDelete, onClose }) {
  const [value, setValue] = useState(currentWeight ? String(currentWeight) : "");
  const dateLabel = new Date(date+"T00:00:00").toLocaleDateString("zh-TW",{month:"long",day:"numeric",weekday:"long"});

  function handleSave() {
    const num = parseFloat(value);
    if (isNaN(num) || num <= 0 || num > 300) return;
    onSave(Math.round(num * 10) / 10); // 四捨五入到小數一位
  }

  return ReactDOM.createPortal(
    <div style={{ position:"fixed", inset:0, zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.2)" }}
      onClick={onClose}>
      <div className="pop-in" onClick={e=>e.stopPropagation()}
        style={{ background:C.card, borderRadius:20, padding:24, boxShadow:"0 8px 40px rgba(0,0,0,0.15)", width:260, margin:20 }}>
        <div style={{ fontSize:13, color:C.sub, marginBottom:4, textAlign:"center" }}>{dateLabel}</div>
        <div style={{ fontSize:16, fontWeight:700, color:C.text, marginBottom:20, textAlign:"center" }}>記錄體重</div>

        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:20 }}>
          <input
            type="number" inputMode="decimal" step="0.1" min="0" max="300"
            value={value} onChange={e=>setValue(e.target.value)}
            placeholder="70.0"
            autoFocus
            onKeyDown={e=>e.key==="Enter"&&handleSave()}
            style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:12, padding:"12px 16px", fontSize:24, color:C.text, background:C.bg, outline:"none", textAlign:"center", fontFamily:"'Noto Serif TC',serif", fontWeight:700 }}
          />
          <div style={{ fontSize:16, color:C.sub, fontWeight:600 }}>kg</div>
        </div>

        <div style={{ display:"flex", gap:8 }}>
          {currentWeight && (
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

// ── Weight App ─────────────────────────────────────────────
function WeightApp({ user, token, saving, setSaving }) {
  const thisYear = new Date().getFullYear();
  const thisMonth = new Date().getMonth() + 1;
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(thisMonth);
  const [data, setData] = useState({}); // { "YYYY-MM-DD": 70.3 }
  const [loaded, setLoaded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const timer = useRef(null);

  const SHEET = "weight";
  const KEY = `${year}_${month}`;
  const [height, setHeight] = useState(null); // 公分
  const [showHeightInput, setShowHeightInput] = useState(false);
  const [heightInput, setHeightInput] = useState("");

  // 載入身高（initUser 已存進 cache，直接讀取不打 API）
  useEffect(()=>{
    const cachedHeight = cacheHas(user, "settings", "height") ? cacheGet(user, "settings", "height") : null;
    if (cachedHeight !== null) {
      if (cachedHeight) {
        setHeight(parseFloat(cachedHeight));
        setHeightInput(String(cachedHeight));
      }
    }
  }, []);

  useEffect(()=>{
    // 先查快取
    if (cacheHas(user, SHEET, KEY)) {
      const cached = cacheGet(user, SHEET, KEY);
      try { setData(cached ? JSON.parse(cached) : {}); } catch { setData({}); }
      setLoaded(true);
      return;
    }
    setLoaded(false);
    apiCall({ action:"readOne", user, sheet:SHEET, key:KEY, token }).then(val => {
      const str = typeof val === "string" ? val : JSON.stringify(val||{});
      cacheSet(user, SHEET, KEY, str);
      try {
        if (!val) { setData({}); }
        else if (typeof val === "object" && !Array.isArray(val)) { setData(val); }
        else { setData(JSON.parse(val)); }
      } catch { setData({}); }
      setLoaded(true);
    });
  }, [year, month]);

  function save(next) {
    setData(next);
    cacheSet(user, SHEET, KEY, JSON.stringify(next));
    setSaving(p=>({...p, weight:true}));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await writeOne(user, SHEET, KEY, JSON.stringify(next), token);
      setSaving(p=>({...p, weight:false}));
    }, 1500);
  }

  function handleSave(weight) {
    save({ ...data, [selectedDate]: weight });
    setSelectedDate(null);
  }

  function handleDelete() {
    const next = { ...data };
    delete next[selectedDate];
    save(next);
    setSelectedDate(null);
  }

  // 統計
  const weights = Object.values(data).filter(w => w > 0);
  const avg = weights.length ? (weights.reduce((a,b)=>a+b,0) / weights.length).toFixed(1) : null;
  const min = weights.length ? Math.min(...weights) : null;
  const max = weights.length ? Math.max(...weights) : null;
  const latestDate = Object.keys(data).filter(k=>data[k]).sort().reverse()[0];
  const latestWeight = latestDate ? data[latestDate] : null;
  const bmi = calcBMI(latestWeight, height);
  const bmiStatus = getBMIStatus(bmi);

  const daysCount = DAYS_IN_MONTH_W(month, year);
  const firstDay = FIRST_DAY_W(month, year);

  function prevMonth() {
    if (month === 1) { setYear(y=>y-1); setMonth(12); }
    else setMonth(m=>m-1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y=>y+1); setMonth(1); }
    else setMonth(m=>m+1);
  }

  const today = new Date();
  const isCurrentMonth = year===today.getFullYear() && month===today.getMonth()+1;

  return (
    <div style={{ height:"100%", overflowY:"auto", padding:"20px 20px 100px", background:C.bg }}>

      {/* 月份導航 */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <button onClick={prevMonth}
          style={{ width:36, height:36, borderRadius:18, background:C.card, border:`1.5px solid ${C.border}`, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, color:C.sub }}>{year}</div>
          <div style={{ fontSize:22, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text }}>{MONTHS_W[month-1]}</div>
        </div>
        <button onClick={nextMonth}
          style={{ width:36, height:36, borderRadius:18, background:C.card, border:`1.5px solid ${C.border}`, cursor:"pointer", fontSize:18, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
      </div>

      {/* 身高設定 + BMI */}
      <div style={{ background:C.card, borderRadius:16, padding:"14px 16px", marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ flex:1 }}>
            {bmi && bmiStatus ? (
              <>
                <div style={{ fontSize:11, color:C.sub, marginBottom:2 }}>最近 BMI（{latestWeight} kg）</div>
                <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                  <span style={{ fontSize:26, fontWeight:700, color:bmiStatus.color, fontFamily:"'Noto Serif TC',serif" }}>{bmi}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:bmiStatus.color, background:bmiStatus.color+"20", padding:"2px 8px", borderRadius:10 }}>{bmiStatus.label}</span>
                </div>
              </>
            ) : (
              <div style={{ fontSize:13, color:C.sub }}>設定身高後可計算 BMI</div>
            )}
          </div>
          {/* 身高設定按鈕 */}
          <button onClick={()=>setShowHeightInput(p=>!p)}
            style={{ background:C.bg, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"8px 12px", cursor:"pointer", textAlign:"center", flexShrink:0 }}>
            <div style={{ fontSize:11, color:C.sub }}>身高</div>
            <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{height ? `${height} cm` : "未設定"}</div>
          </button>
        </div>
        {/* 身高輸入 */}
        {showHeightInput && (
          <div className="pop-in" style={{ marginTop:12, display:"flex", gap:8 }}>
            <input type="number" inputMode="decimal" value={heightInput} onChange={e=>setHeightInput(e.target.value)}
              placeholder="例如 165" min="100" max="250"
              style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:10, padding:"8px 12px", fontSize:15, outline:"none", background:C.bg, color:C.text }} />
            <span style={{ alignSelf:"center", color:C.sub, fontSize:13 }}>cm</span>
            <button onClick={async()=>{
              const h = parseFloat(heightInput);
              if (isNaN(h)||h<100||h>250) return;
              setHeight(h);
              setShowHeightInput(false);
              cacheSet(user, "settings", "height", String(h));
              await apiCall({ action:"saveHeight", user, token, value:String(h) });
            }} style={{ background:C.accent, color:"#fff", border:"none", borderRadius:10, padding:"8px 14px", cursor:"pointer", fontSize:13, fontWeight:600 }}>儲存</button>
          </div>
        )}
      </div>

      {/* 統計卡 */}
      {weights.length > 0 && (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:14 }}>
          {[
            { label:"本月平均", value:`${avg} kg`, color:C.accent },
            { label:"最輕", value:`${min} kg`, color:"#4A7C59" },
            { label:"最重", value:`${max} kg`, color:"#D0533A" },
          ].map(s=>(
            <div key={s.label} style={{ background:C.card, borderRadius:14, padding:"12px 10px", textAlign:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:4 }}>{s.label}</div>
              <div style={{ fontSize:15, fontWeight:700, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 折線圖 */}
      <WeightLineChart data={data} year={year} month={month} />

      {/* 日曆 */}
      <div style={{ background:C.card, borderRadius:16, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        {/* 星期標題 */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:8 }}>
          {["日","一","二","三","四","五","六"].map(d=>(
            <div key={d} style={{ textAlign:"center", fontSize:11, color:C.sub, fontWeight:500, padding:"4px 0" }}>{d}</div>
          ))}
        </div>

        {/* 日期格子 */}
        {!loaded ? (
          <div style={{ padding:24, display:"flex", justifyContent:"center" }}>
            <div style={{ width:28, height:28, borderRadius:14, border:`3px solid ${C.border}`, borderTopColor:C.accent, animation:"spin 0.8s linear infinite" }} />
          </div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
            {Array(firstDay).fill(null).map((_,i)=><div key={"e"+i} />)}
            {Array(daysCount).fill(null).map((_,i)=>{
              const day = i+1;
              const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
              const weight = data[dateKey];
              const { bg, text } = weight ? getWeightColor(weight, min, max) : { bg:C.bg, text:C.sub };
              const isToday = isCurrentMonth && day===today.getDate();

              return (
                <button key={day} onClick={()=>setSelectedDate(dateKey)}
                  style={{ aspectRatio:"1", borderRadius:10, border:`1.5px solid ${isToday?"#4A7C59":weight?"transparent":C.border}`, background:weight?bg:C.bg, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, padding:2, transition:"all 0.15s" }}>
                  <span style={{ fontSize:10, color:isToday?C.accent:C.sub, fontWeight:isToday?700:400 }}>{day}</span>
                  {weight && <span style={{ fontSize:9, fontWeight:700, color:text, lineHeight:1 }}>{weight}</span>}
                </button>
              );
            })}
          </div>
        )}

        {weights.length === 0 && loaded && (
          <div style={{ textAlign:"center", padding:"16px 0 8px", color:C.sub, fontSize:13 }}>點擊日期記錄體重</div>
        )}
      </div>

      {/* 輸入 Modal */}
      {selectedDate && (
        <WeightInputModal
          date={selectedDate}
          currentWeight={data[selectedDate]}
          onSave={handleSave}
          onDelete={handleDelete}
          onClose={()=>setSelectedDate(null)}
        />
      )}
    </div>
  );
}