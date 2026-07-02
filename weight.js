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

// ── 孕期體重追蹤 ────────────────────────────────────────────
// 依「十月懷胎」傳統算法：以最後一次月經日（LMP）為起點，每個孕月固定28天（4週）
const PREG_MONTHS = 10;

// 依孕前 BMI 分類（美國 IOM 標準）估算整個孕期建議總增重範圍
function pregnancyCategoryFor(bmi) {
  if (bmi < 18.5) return { label:"過輕", min:12.5, max:18 };
  if (bmi < 25)   return { label:"正常", min:11.5, max:16 };
  if (bmi < 30)   return { label:"過重", min:7, max:11.5 };
  return             { label:"肥胖", min:5, max:9 };
}

// 累計增重佔總增重的比例：前3個月（第一孕期）只佔12%，其餘平均分配到第4~10個月
function pregnancyCumFraction(m) {
  const triFrac = 0.12;
  if (m <= 3) return (m / 3) * triFrac;
  return triFrac + ((m - 3) / 7) * (1 - triFrac);
}

function pregnancyMonthRange(lmpStr, m) {
  const lmp = new Date(lmpStr + "T00:00:00");
  const start = new Date(lmp); start.setDate(start.getDate() + (m - 1) * 28);
  const end = new Date(lmp); end.setDate(end.getDate() + m * 28 - 1);
  return { start, end };
}

function fmtMD_P(d) { return `${d.getMonth() + 1}/${d.getDate()}`; }
function dateKeyP(d) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

// 找出從 start 到 end 涵蓋的所有 {year, month}，用來知道要向伺服器抓哪幾個月的體重資料
function monthKeysBetween(start, end) {
  const keys = [];
  let y = start.getFullYear(), m = start.getMonth() + 1;
  const endY = end.getFullYear(), endM = end.getMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    keys.push({ year: y, month: m });
    m++; if (m > 12) { m = 1; y++; }
  }
  return keys;
}

function PregnancyHeader({ title, onBack, right }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 4px 18px" }}>
      <button onClick={onBack}
        style={{ display:"flex", alignItems:"center", gap:4, background:"none", border:"none", cursor:"pointer", fontSize:14, color:C.sub, padding:"6px 4px" }}>
        <span style={{ fontSize:18 }}>‹</span> 返回
      </button>
      <div style={{ fontSize:15, fontWeight:700, color:C.text, fontFamily:"'Noto Serif TC',serif" }}>{title}</div>
      <div style={{ width:56, textAlign:"right" }}>{right}</div>
    </div>
  );
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function PregnancySetup({ user, token, initial, height, onSaved }) {
  const [lmp, setLmp] = useState(initial.lmpDate || todayStr());
  const [preW, setPreW] = useState(initial.prePregnancyWeight ? String(initial.prePregnancyWeight) : "");
  const [saving, setSavingLocal] = useState(false);

  async function handleSave() {
    const w = parseFloat(preW);
    if (!lmp || isNaN(w) || w <= 0) return;
    setSavingLocal(true);
    const payload = { lmpDate: lmp, prePregnancyWeight: w };
    const str = JSON.stringify(payload);
    cacheSet(user, "pregnancy", "settings", str);
    await writeOne(user, "pregnancy", "settings", str, token);
    setSavingLocal(false);
    onSaved(payload);
  }

  const inp = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"13px 16px", fontSize:15, color:C.text, background:C.card, outline:"none" };
  const canSave = lmp && preW && !isNaN(parseFloat(preW));

  return (
    <div style={{ padding:"8px 20px 40px" }}>
      <div style={{ textAlign:"center", marginBottom:26 }}>
        <div style={{ fontSize:36, marginBottom:8 }}>🤰</div>
        <div style={{ fontSize:13, color:C.sub }}>先設定最後一次月經日與孕前體重，{"\n"}就能算出每個孕月的建議增重範圍</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:14, maxWidth:320, margin:"0 auto" }}>
        <div>
          <div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>最後一次月經日（LMP）</div>
          <input type="date" value={lmp} onChange={e=>setLmp(e.target.value)}
            style={{ ...inp, WebkitAppearance:"none", appearance:"none" }} />
        </div>
        <div>
          <div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>孕前體重（kg）</div>
          <input type="number" inputMode="decimal" step="0.1" value={preW} onChange={e=>setPreW(e.target.value)} placeholder="例如 52" style={inp} />
        </div>
        {!height && (
          <div style={{ fontSize:12, color:C.sub, background:C.accentLight, borderRadius:10, padding:"10px 12px" }}>
            提醒：還沒設定身高，先在上方「身高」欄位填寫，才能算出孕前 BMI。
          </div>
        )}
        <button onClick={handleSave} disabled={saving || !canSave}
          style={{ padding:"13px 0", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:15, fontWeight:600, cursor:"pointer", opacity:(saving||!canSave)?0.5:1 }}>
          {saving ? "儲存中…" : "開始追蹤"}
        </button>
      </div>
    </div>
  );
}

// 累計增重曲線圖：建議區間 vs 實際累計增重
function PregnancyChart({ rows, preWeight }) {
  const W = 320, H = 150, PAD = { top: 14, bottom: 22, left: 30, right: 10 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const allVals = [];
  rows.forEach(r => {
    if (r.targetMax != null) allVals.push(r.targetMax);
    if (r.avg != null) allVals.push(r.avg - preWeight);
  });
  const maxVal = Math.max(...allVals, 1) * 1.15;

  const x = (m) => PAD.left + (chartW * (m - 1) / (PREG_MONTHS - 1));
  const y = (v) => PAD.top + chartH - (chartH * v / maxVal);

  const bandTop = rows.map(r => `${r.m===1?'M':'L'} ${x(r.m)} ${y(r.targetMax)}`).join(' ');
  const bandBottom = rows.slice().reverse().map(r => `L ${x(r.m)} ${y(r.targetMin)}`).join(' ');
  const bandPath = `${bandTop} ${bandBottom} Z`;

  const actualPts = rows.filter(r => r.avg != null).map(r => ({ m:r.m, v:r.avg - preWeight }));
  const actualLine = actualPts.map((p,i) => `${i===0?'M':'L'} ${x(p.m)} ${y(p.v)}`).join(' ');

  const yTicks = [0, maxVal/2, maxVal].map(v => Math.round(v*10)/10);

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display:"block", overflow:"visible" }}>
      {yTicks.map((v,i) => (
        <g key={i}>
          <line x1={PAD.left} y1={y(v)} x2={W-PAD.right} y2={y(v)} stroke={C.border} strokeWidth="1" strokeDasharray="3,3" />
          <text x={PAD.left-4} y={y(v)+3} textAnchor="end" fontSize="8" fill={C.sub}>{v}</text>
        </g>
      ))}
      <path d={bandPath} fill={C.accent} opacity="0.13" />
      {actualPts.length > 0 && <path d={actualLine} fill="none" stroke={C.red} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {actualPts.map((p,i) => <circle key={i} cx={x(p.m)} cy={y(p.v)} r="3" fill={C.red} />)}
      {rows.map(r => (
        <text key={r.m} x={x(r.m)} y={H-6} textAnchor="middle" fontSize="8" fill={C.sub}>{r.m}</text>
      ))}
    </svg>
  );
}

function PregnancyMonthCard({ row }) {
  const hasTarget = row.targetMin != null;
  let status = null;
  if (row.avg != null && hasTarget) {
    const gain = row.avg - row.preWeight;
    if (gain > row.targetMax) status = { label:`高於建議 +${(gain-row.targetMax).toFixed(1)}kg`, color:"#D0533A" };
    else if (gain < row.targetMin) status = { label:`低於建議 ${(gain-row.targetMin).toFixed(1)}kg`, color:"#C4622D" };
    else status = { label:"落在建議範圍內", color:"#4A7C59" };
  }

  return (
    <div style={{ background:C.card, borderRadius:14, padding:"12px 14px", boxShadow:"0 1px 3px rgba(0,0,0,0.06)", display:"flex", alignItems:"center", gap:12 }}>
      <div style={{ width:56, flexShrink:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:C.accent, fontFamily:"'Noto Serif TC',serif" }}>第{row.m}月</div>
        <div style={{ fontSize:10, color:C.sub, marginTop:1 }}>{fmtMD_P(row.start)}–{fmtMD_P(row.end)}</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:11, color:C.sub }}>
          建議累計 {hasTarget ? `+${row.targetMin.toFixed(1)}~+${row.targetMax.toFixed(1)}kg` : "—"}
        </div>
        {row.avg != null ? (
          <div style={{ fontSize:13, fontWeight:600, color:status?status.color:C.text, marginTop:2 }}>
            平均 {row.avg.toFixed(1)}kg（{row.count}筆）· {status && status.label}
          </div>
        ) : (
          <div style={{ fontSize:12, color:C.sub, marginTop:2 }}>本月尚無體重紀錄</div>
        )}
      </div>
    </div>
  );
}

function PregnancyView({ user, token, height, onBack }) {
  const [settings, setSettings] = useState(null); // null=載入中, false=尚未設定
  const [weightData, setWeightData] = useState({});
  const [dataLoaded, setDataLoaded] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  useEffect(() => {
    (async () => {
      if (cacheHas(user, "pregnancy", "settings")) {
        const raw = cacheGet(user, "pregnancy", "settings");
        try { setSettings(raw ? JSON.parse(raw) : false); } catch { setSettings(false); }
        return;
      }
      const val = await apiCall({ action:"readOne", user, sheet:"pregnancy", key:"settings", token });
      const str = typeof val === "string" ? val : (val ? JSON.stringify(val) : "");
      cacheSet(user, "pregnancy", "settings", str);
      try { setSettings(str ? JSON.parse(str) : false); } catch { setSettings(false); }
    })();
  }, []);

  useEffect(() => {
    if (!settings || !settings.lmpDate) return;
    (async () => {
      setDataLoaded(false);
      const { start } = pregnancyMonthRange(settings.lmpDate, 1);
      const { end } = pregnancyMonthRange(settings.lmpDate, PREG_MONTHS);
      const keys = monthKeysBetween(start, end);
      const merged = {};
      await Promise.all(keys.map(async ({ year, month }) => {
        const k = `${year}_${month}`;
        let str;
        if (cacheHas(user, "weight", k)) {
          str = cacheGet(user, "weight", k);
        } else {
          const val = await apiCall({ action:"readOne", user, sheet:"weight", key:k, token });
          str = typeof val === "string" ? val : JSON.stringify(val || {});
          cacheSet(user, "weight", k, str);
        }
        try {
          const obj = str ? JSON.parse(str) : {};
          Object.assign(merged, obj);
        } catch {}
      }));
      setWeightData(merged);
      setDataLoaded(true);
    })();
  }, [settings && settings.lmpDate]);

  if (settings === null) {
    return (
      <div style={{ height:"100%", background:C.bg, padding:"0 16px" }}>
        <PregnancyHeader title="孕期體重追蹤" onBack={onBack} />
        <Spinner />
      </div>
    );
  }

  if (settings === false || !settings.lmpDate || showEdit) {
    return (
      <div style={{ height:"100%", overflowY:"auto", background:C.bg, padding:"0 16px 40px" }}>
        <PregnancyHeader title="孕期體重追蹤" onBack={showEdit ? ()=>setShowEdit(false) : onBack} />
        <PregnancySetup
          user={user} token={token} height={height}
          initial={settings || {}}
          onSaved={(s)=>{ setSettings(s); setShowEdit(false); }}
        />
      </div>
    );
  }

  const bmi = calcBMI(settings.prePregnancyWeight, height);
  const cat = bmi ? pregnancyCategoryFor(bmi) : null;

  const rows = [];
  for (let m = 1; m <= PREG_MONTHS; m++) {
    const { start, end } = pregnancyMonthRange(settings.lmpDate, m);
    const fracMin = pregnancyCumFraction(m);
    const targetMin = cat ? cat.min * fracMin : null;
    const targetMax = cat ? cat.max * fracMin : null;
    const readings = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dateKeyP(d);
      if (weightData[key]) readings.push(weightData[key]);
    }
    const avg = readings.length ? readings.reduce((a,b)=>a+b,0) / readings.length : null;
    rows.push({ m, start, end, targetMin, targetMax, avg, count: readings.length, preWeight: settings.prePregnancyWeight });
  }

  const today = new Date();
  const daysSinceLMP = Math.floor((today - new Date(settings.lmpDate + "T00:00:00")) / 86400000);
  const weeksNow = Math.floor(daysSinceLMP / 7);

  return (
    <div style={{ height:"100%", overflowY:"auto", background:C.bg, padding:"0 16px 40px" }}>
      <PregnancyHeader
        title="孕期體重追蹤"
        onBack={onBack}
        right={<button onClick={()=>setShowEdit(true)} style={{ background:"none", border:"none", color:C.sub, fontSize:13, cursor:"pointer" }}>編輯</button>}
      />

      {/* 概況卡 */}
      <div style={{ background:C.card, borderRadius:16, padding:"14px 16px", marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div>
            <div style={{ fontSize:11, color:C.sub, marginBottom:2 }}>
              {daysSinceLMP >= 0 ? `目前約第 ${weeksNow} 週` : "尚未開始"}
            </div>
            {bmi && cat ? (
              <div style={{ display:"flex", alignItems:"baseline", gap:8 }}>
                <span style={{ fontSize:22, fontWeight:700, color:C.text, fontFamily:"'Noto Serif TC',serif" }}>BMI {bmi}</span>
                <span style={{ fontSize:12, fontWeight:600, color:C.accent, background:C.accentLight, padding:"2px 8px", borderRadius:10 }}>{cat.label}</span>
              </div>
            ) : (
              <div style={{ fontSize:13, color:C.sub }}>設定身高後可計算 BMI</div>
            )}
          </div>
          {cat && (
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:11, color:C.sub, marginBottom:2 }}>建議總增重</div>
              <div style={{ fontSize:15, fontWeight:700, color:C.accent }}>{cat.min}–{cat.max} kg</div>
            </div>
          )}
        </div>
      </div>

      {/* 曲線圖 */}
      {cat && (
        <div style={{ background:C.card, borderRadius:16, padding:"14px 16px", marginBottom:14, boxShadow:"0 1px 3px rgba(0,0,0,0.06)" }}>
          <div style={{ fontSize:12, color:C.sub, marginBottom:6 }}>累計增重曲線（陰影為建議區間）</div>
          {!dataLoaded ? <Spinner /> : <PregnancyChart rows={rows} preWeight={settings.prePregnancyWeight} />}
        </div>
      )}

      {/* 每月卡片 */}
      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {rows.map(r => <PregnancyMonthCard key={r.m} row={r} />)}
      </div>

      <div style={{ fontSize:11, color:C.sub, lineHeight:1.7, marginTop:16, padding:"12px 4px" }}>
        增重範圍依美國 IOM 標準與孕前 BMI 估算，第一孕期（1–3個月）增重較緩、第4個月起以固定速度累加，為平均估算曲線，個人差異很大。「平均體重」取自你在體重日曆中該區間內的紀錄。若增重明顯超出或低於區間，建議與產檢醫師討論。
      </div>
    </div>
  );
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
  const [showPregnancy, setShowPregnancy] = useState(false);
  const [hidePregnancyEntry, setHidePregnancyEntry] = useState(()=> localStorage.getItem("hidePregnancyEntry_"+user)==="1");

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

  if (showPregnancy) {
    return (
      <PregnancyView
        user={user} token={token} height={height}
        onBack={()=>setShowPregnancy(false)}
      />
    );
  }

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

      {/* 孕期體重追蹤 入口（放在頁尾、低調，非所有使用者都需要） */}
      <div style={{ textAlign:"center", marginTop:18 }}>
        {!hidePregnancyEntry ? (
          <div style={{ display:"inline-flex", alignItems:"center", gap:4 }}>
            <button onClick={()=>setShowPregnancy(true)}
              style={{ background:"none", border:"none", color:C.sub, fontSize:11.5, cursor:"pointer", padding:"4px 2px", textDecoration:"underline", textUnderlineOffset:2 }}>
              🤰 孕期追蹤
            </button>
            <button onClick={()=>{ localStorage.setItem("hidePregnancyEntry_"+user, "1"); setHidePregnancyEntry(true); }}
              title="隱藏此功能"
              style={{ width:18, height:18, borderRadius:9, border:"none", background:"none", color:C.sub, fontSize:12, cursor:"pointer", display:"inline-flex", alignItems:"center", justifyContent:"center" }}>
              ×
            </button>
          </div>
        ) : (
          <button onClick={()=>{ localStorage.removeItem("hidePregnancyEntry_"+user); setHidePregnancyEntry(false); }}
            style={{ background:"none", border:"none", color:C.sub, fontSize:11, cursor:"pointer", padding:"4px 2px", textDecoration:"underline", textUnderlineOffset:2 }}>
            顯示孕期追蹤入口
          </button>
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