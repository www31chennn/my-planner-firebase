// ── planner.js ────────────────────────────────────────────
// 計畫本模組：年度目標、月份計畫、當日記錄

const { useState, useEffect, useRef } = React;

const MONTHS = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const DAYS_IN_MONTH = (m,y) => new Date(y,m,0).getDate();
const FIRST_DAY = (m,y) => new Date(y,m-1,1).getDay();
const DEFAULT_MOODS = ["😊","😢","😡","😴","🥰","😰","🎉","💪","🌧","☀️"];

// ── Year Goals ─────────────────────────────────────────────
function YearGoals({ user, token, saving, setSaving, year }) {
  const [list, setList] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    if (cacheHas(user, "goals", String(year))) {
      const cached = cacheGet(user, "goals", String(year));
      try { setList(cached ? JSON.parse(cached) : []); } catch { setList([]); }
      setLoaded(true);
      return;
    }
    setLoaded(false);
    cachedReadOne(user, "goals", String(year), token).then(val => {
      try { setList(val ? JSON.parse(val) : []); } catch { setList([]); }
      setLoaded(true);
    });
  }, [year]);

  function save(next) {
    setList(next);
    cacheUpdate(user, "goals", String(year), JSON.stringify(next));
    setSaving(p=>({...p,goals:true}));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await writeOne(user, "goals", String(year), JSON.stringify(next), token);
      setSaving(p=>({...p,goals:false}));
    }, 1500);
  }

  function toggle(i) {
    const n = [...list];
    const isDone = !n[i].done;
    n[i] = { ...n[i], done:isDone, doneDate: isDone ? new Date().toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"}) : "" };
    save(n);
  }

  const done = list.filter(g=>g.done&&g.text).length;
  const total = list.filter(g=>g.text).length;

  if (!loaded) return <Spinner />;

  return (
    <div style={{ padding:"20px 20px 120px" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ fontSize:13, color:C.sub, letterSpacing:2, marginBottom:4 }}>年度目標</div>
        <div style={{ fontSize:26, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text }}>{year}</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:10 }}>
          <div style={{ fontSize:13, color:C.sub }}>{total>0?`${done} / ${total} 完成`:"開始新增你的目標吧"}</div>
          <SaveDot saving={saving} />
        </div>
        {total>0 && (
          <div style={{ marginTop:8, height:3, background:C.border, borderRadius:2, overflow:"hidden" }}>
            <div style={{ height:"100%", width:`${(done/total)*100}%`, background:C.accent, borderRadius:2, transition:"width 0.5s" }} />
          </div>
        )}
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {list.map((goal,i) => (
          <div key={i} className="fade-up" style={{ background:C.card, borderRadius:14, padding:"12px 14px", boxShadow:"0 1px 3px rgba(0,0,0,0.05)", opacity:goal.done?0.5:1, animationDelay:`${i*20}ms` }}>
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <button onClick={()=>toggle(i)} style={{ width:22, height:22, borderRadius:11, border:`2px solid ${goal.done?C.accent:C.border}`, background:goal.done?C.accent:"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, padding:0, transition:"all 0.2s" }}>
                {goal.done && <svg width="11" height="9" viewBox="0 0 11 9" fill="none"><path d="M1 4L4 7.5L10 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
              </button>
              <input style={{ flex:1, border:"none", outline:"none", fontSize:15, background:"transparent", textDecoration:goal.done?"line-through":"none", color:goal.done?C.sub:C.text, minWidth:0 }}
                placeholder={`目標 ${i+1}`} value={goal.text}
                onChange={e=>{ const n=[...list]; n[i]={...n[i],text:e.target.value}; save(n); }} />
              <button onClick={()=>save(list.filter((_,idx)=>idx!==i))} style={{ flexShrink:0, background:"none", border:"none", color:C.sub, cursor:"pointer", fontSize:18, padding:"0 2px", lineHeight:1 }}>×</button>
            </div>
            {goal.done&&goal.doneDate && (
              <div style={{ fontSize:11, color:C.accent, marginTop:5, marginLeft:32 }}>✓ 完成於 {goal.doneDate}</div>
            )}
          </div>
        ))}
        <button onClick={()=>save([...list,{text:"",done:false,doneDate:""}])}
          style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:"none", border:`1.5px dashed ${C.border}`, borderRadius:14, padding:"13px 0", cursor:"pointer", color:C.sub, fontSize:14 }}>
          <span style={{ fontSize:20, lineHeight:1 }}>+</span> 新增目標
        </button>
      </div>
    </div>
  );
}

// ── Mood Picker ────────────────────────────────────────────
function MoodPicker({ day, currentMood, onSelect, onClear, onClose }) {
  const [custom, setCustom] = useState("");
  useEffect(()=>{
    function handle(e) { if(e.target.id==="mood-backdrop") onClose(); }
    document.addEventListener("mousedown",handle);
    return ()=>document.removeEventListener("mousedown",handle);
  },[]);
  return ReactDOM.createPortal(
    <div id="mood-backdrop" style={{ position:"fixed", inset:0, zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.15)" }}>
      <div className="pop-in" style={{ background:C.card, borderRadius:16, padding:16, boxShadow:"0 8px 40px rgba(0,0,0,0.2)", width:220, margin:20 }}>
        <div style={{ fontSize:11, color:C.sub, marginBottom:8, textAlign:"center" }}>{day} 日的心情</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginBottom:10 }}>
          {DEFAULT_MOODS.map(m=>(
            <button key={m} onClick={()=>onSelect(m)} style={{ fontSize:21, background:currentMood===m?C.accentLight:"none", border:currentMood===m?`1.5px solid ${C.accent}`:"1.5px solid transparent", borderRadius:8, padding:3, cursor:"pointer" }}>{m}</button>
          ))}
        </div>
        <div style={{ display:"flex", gap:6, marginBottom:currentMood?8:0 }}>
          <input value={custom} onChange={e=>setCustom(e.target.value)} placeholder="自訂符號…" maxLength={2}
            style={{ flex:1, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"6px 8px", fontSize:14, outline:"none", color:C.text, background:C.bg, minWidth:0 }} />
          <button onClick={()=>{ if(custom.trim()){ onSelect(custom.trim()); setCustom(""); }}}
            style={{ background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"6px 10px", cursor:"pointer", fontSize:13, fontWeight:600, flexShrink:0 }}>選</button>
        </div>
        {currentMood && <button onClick={onClear} style={{ width:"100%", fontSize:12, color:C.red, background:"none", border:`1px solid ${C.red}`, borderRadius:8, padding:"5px 0", cursor:"pointer" }}>清除心情</button>}
      </div>
    </div>,
    document.body
  );
}

// ── Month Planner ──────────────────────────────────────────
function MonthPlanner({ user, token, saving, setSaving, year }) {
  const [selected, setSelected] = useState(null);
  const [moodPickerDay, setMoodPickerDay] = useState(null);
  const [monthCache, setMonthCache] = useState({});
  const [listLoaded, setListLoaded] = useState(false);
  const timers = useRef({});

  function getKey(m) { return `${year}_${m}`; }

  useEffect(() => {
    // 先檢查今年 12 個月的快取是否都有
    const allCached = Array.from({length:12}, (_,i) => i+1)
      .every(m => cacheHas(user, "month", `${year}_${m}`));

    if (allCached) {
      // 快取都有，直接從快取建立 monthCache
      const newCache = {};
      for (let m = 1; m <= 12; m++) {
        const key = `${year}_${m}`;
        const cached = cacheGet(user, "month", key);
        try { newCache[key] = cached ? JSON.parse(cached) : {}; } catch { newCache[key] = {}; }
      }
      setMonthCache(p => ({ ...p, ...newCache }));
      setListLoaded(true);
      return;
    }

    // 快取沒有，打 API
    setListLoaded(false);
    apiCall({ action:"readAll", user, sheet:"month", token }).then(rows => {
      const newCache = {};
      for (let m = 1; m <= 12; m++) newCache[`${year}_${m}`] = {};
      if (Array.isArray(rows)) {
        rows.forEach(r => {
          if (!r[0] || r[0] === "key") return;
          if (!String(r[0]).startsWith(String(year))) return;
          try { newCache[String(r[0])] = JSON.parse(r[1]); } catch { newCache[String(r[0])] = {}; }
          cacheUpdate(user, "month", String(r[0]), r[1]||"");
        });
      }
      // 空白月份也存進快取
      for (let m = 1; m <= 12; m++) {
        const key = `${year}_${m}`;
        if (!cacheHas(user, "month", key)) cacheSet(user, "month", key, "");
      }
      setMonthCache(p => ({ ...p, ...newCache }));
      setListLoaded(true);
    });
  }, [year]);

  async function loadMonth(m) {
    const key = getKey(m);
    if (monthCache[key] !== undefined) return;
    const val = await cachedReadOne(user, "month", key, token);
    try { setMonthCache(p => ({ ...p, [key]: val ? JSON.parse(val) : {} })); }
    catch { setMonthCache(p => ({ ...p, [key]: {} })); }
  }

  function openMonth(m) {
    setSelected(m);
    if (monthCache[getKey(m)] === undefined) loadMonth(m);
  }

  function saveMonth(m, data) {
    const key = getKey(m);
    setMonthCache(p => ({ ...p, [key]: data }));
    cacheUpdate(user, "month", key, JSON.stringify(data));

    // 只有真正有內容才寫入 Sheet，避免寫入空資料
    const hasPlan = data.plan && data.plan.trim();
    const hasMarked = data.marked && Object.keys(data.marked).length > 0;
    if (!hasPlan && !hasMarked) return;

    setSaving(p=>({...p,month:true}));
    clearTimeout(timers.current[key]);
    timers.current[key] = setTimeout(async () => {
      await writeOne(user, "month", key, JSON.stringify(data), token);
      setSaving(p=>({...p,month:false}));
    }, 1500);
  }

  if (selected !== null) {
    const m=selected, mData=monthCache[getKey(m)], mode=mData?.mode||"plan", marked=mData?.marked||{};
    if (mData === undefined) return <Spinner />;
    // 每次 update 都從 monthCache 拿最新資料，避免 closure 拿到過期的 mData
    const update = (patch) => {
      const latest = monthCache[getKey(m)] || {};
      saveMonth(m, { ...latest, ...patch });
    };

    return (
      <div style={{ padding:"20px 20px 120px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
          <button onClick={()=>{ setSelected(null); setMoodPickerDay(null); }}
            style={{ width:32, height:32, borderRadius:16, background:C.border, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <svg width="8" height="13" viewBox="0 0 8 13" fill="none"><path d="M7 1L1 6.5L7 12" stroke={C.text} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, color:C.sub }}>{year}</div>
            <div style={{ fontSize:22, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text }}>{MONTHS[m-1]}</div>
          </div>
          <SaveDot saving={saving} />
        </div>
        <div style={{ display:"flex", background:C.border, borderRadius:10, padding:3, marginBottom:20 }}>
          {[["plan","📋 計畫"],["calendar","📅 日曆"]].map(([k,l])=>(
            <button key={k} onClick={()=>update({mode:k})} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:mode===k?600:400, color:mode===k?C.text:C.sub, background:mode===k?C.card:"transparent", transition:"all 0.2s" }}>{l}</button>
          ))}
        </div>
        {mode==="plan" ? (
          <div>
            <textarea style={{ width:"100%", minHeight:220, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, fontSize:15, lineHeight:1.7, color:C.text, background:C.card, resize:"none", outline:"none" }}
              placeholder={`記錄 ${MONTHS[m-1]} 的計畫…`} value={mData.plan||""} onChange={e=>update({plan:e.target.value})} />
            {mData.plan&&<button onClick={()=>update({plan:""})} style={{ marginTop:10, background:"none", border:`1px solid ${C.red}`, color:C.red, borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:13 }}>清除</button>}
          </div>
        ):(
          <div style={{ background:C.card, borderRadius:16, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
            <div style={{ fontSize:11, color:C.sub, textAlign:"center", marginBottom:10 }}>點擊日期選擇心情或自訂符號</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:2, marginBottom:8 }}>
              {["日","一","二","三","四","五","六"].map(d=><div key={d} style={{ textAlign:"center", fontSize:11, color:C.sub, fontWeight:500, padding:"4px 0" }}>{d}</div>)}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4 }}>
              {Array(FIRST_DAY(m,year)).fill(null).map((_,i)=><div key={"e"+i} />)}
              {Array(DAYS_IN_MONTH(m,year)).fill(null).map((_,i)=>{
                const day=i+1, mood=marked[day], isOpen=moodPickerDay===day;
                const setMood=(mo)=>{ update({marked:{...marked,[day]:mo}}); setMoodPickerDay(null); };
                const clearMood=()=>{ const nm={...marked}; delete nm[day]; update({marked:nm}); setMoodPickerDay(null); };
                return (
                  <div key={day}>
                    <button onClick={()=>setMoodPickerDay(isOpen?null:day)}
                      style={{ width:"100%", aspectRatio:"1", borderRadius:10, border:`1.5px solid ${mood?C.accent+"40":C.border}`, background:mood?C.accentLight:C.bg, cursor:"pointer", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:1, padding:2, transition:"all 0.15s" }}>
                      <span style={{ color:C.sub, fontSize:10 }}>{day}</span>
                      {mood&&<span style={{ fontSize:13, lineHeight:1 }}>{mood}</span>}
                    </button>
                    {isOpen&&<MoodPicker day={day} currentMood={mood} onSelect={setMood} onClear={clearMood} onClose={()=>setMoodPickerDay(null)} />}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!listLoaded) return <Spinner />;

  return (
    <div style={{ padding:"20px 20px 120px" }}>
      <div style={{ marginBottom:24 }}>
        <div style={{ fontSize:13, color:C.sub, letterSpacing:2, marginBottom:4 }}>月份計畫</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
          <div style={{ fontSize:26, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text }}>{year}</div>
          <SaveDot saving={saving} />
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10 }}>
        {MONTHS.map((label,i)=>{
          const m=i+1, mData=monthCache[getKey(m)]||{};
          const hasPlan=mData.plan&&mData.plan.trim();
          const moodCount=Object.values(mData.marked||{}).filter(Boolean).length;
          const isCurrent=m===new Date().getMonth()+1&&year===new Date().getFullYear();
          return (
            <button key={m} onClick={()=>openMonth(m)} style={{ background:isCurrent?C.accentLight:C.card, borderRadius:14, padding:"14px 12px", display:"flex", flexDirection:"column", alignItems:"flex-start", gap:5, border:`1.5px solid ${isCurrent?C.accent+"50":C.border}`, cursor:"pointer", textAlign:"left" }}>
              <div style={{ fontSize:15, fontWeight:600, color:isCurrent?C.accent:C.text }}>{label}</div>
              {hasPlan&&<div style={{ fontSize:10, color:C.sub }}>📋 有計畫</div>}
              {moodCount>0&&<div style={{ fontSize:10, color:C.sub }}>😊 {moodCount} 天</div>}
              {!hasPlan&&moodCount===0&&<div style={{ fontSize:10, color:C.border }}>— 空白</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Daily Note ─────────────────────────────────────────────
function DailyNote({ user, token, saving, setSaving }) {
  function toDateKey(d) {
    if (!d) return "";
    const parts = d.split(/[-/]/);
    return `${parts[0]}-${String(parts[1]).padStart(2,'0')}-${String(parts[2]).padStart(2,'0')}`;
  }
  function localToday() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  }
  const today = localToday();
  const [date, setDate] = useState(today);
  const [noteCache, setNoteCache] = useState(() => {
    const init = {};
    if (cacheHas(user, "daily", today)) init[today] = cacheGet(user, "daily", today) || "";
    return init;
  });
  const timer = useRef(null);

  useEffect(() => {
    if (cacheHas(user, "daily", date)) {
      setNoteCache(p => ({ ...p, [date]: cacheGet(user, "daily", date) || "" }));
      return;
    }
    cachedReadOne(user, "daily", date, token).then(val => {
      setNoteCache(p => ({ ...p, [date]: val || "" }));
    });
  }, [date]);

  const note = noteCache[date] ?? null;

  function save(text) {
    setNoteCache(p => ({ ...p, [date]: text }));
    cacheUpdate(user, "daily", date, text);
    setSaving(p=>({...p,daily:true}));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      if (text) await writeOne(user, "daily", date, text, token);
      else await deleteOne(user, "daily", date, token);
      setSaving(p=>({...p,daily:false}));
    }, 1500);
  }

  const dateLabel = new Date(date+"T00:00:00").toLocaleDateString("zh-TW",{month:"long",day:"numeric",weekday:"long"});

  return (
    <div style={{ padding:"20px 20px 120px" }}>
      <div style={{ marginBottom:16 }}>
        <div style={{ fontSize:13, color:C.sub, letterSpacing:2, marginBottom:4 }}>當日記錄</div>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:8 }}>
          <div style={{ fontSize:16, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text, flex:1, minWidth:0 }}>{dateLabel}</div>
          <SaveDot saving={saving} />
        </div>
      </div>
      <input type="date" value={date} onChange={e=>setDate(toDateKey(e.target.value))}
        style={{ width:"100%", maxWidth:"100%", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"11px 14px", fontSize:14, color:C.text, background:C.card, outline:"none", marginBottom:16, display:"block", WebkitAppearance:"none", appearance:"none" }} />
      {note === null ? <Spinner /> : (
        <>
          {!note && <div style={{ textAlign:"center", padding:"20px 0 12px", color:C.sub, fontSize:14 }}>這天還沒有記錄</div>}
          <textarea style={{ width:"100%", minHeight:260, border:`1.5px solid ${C.border}`, borderRadius:14, padding:16, fontSize:15, lineHeight:1.8, color:C.text, background:C.card, resize:"none", outline:"none", display:"block" }}
            value={note} onChange={e=>save(e.target.value)} placeholder="今天發生了什麼事…" />
          {note && <button onClick={()=>save("")} style={{ marginTop:10, background:"none", border:`1px solid ${C.red}`, color:C.red, borderRadius:8, padding:"7px 14px", cursor:"pointer", fontSize:13 }}>清除</button>}
        </>
      )}
    </div>
  );
}

// ── Planner App ────────────────────────────────────────────
const TABS = [
  { id:"goals", label:"年度目標", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6"/><circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.6"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/></svg> },
  { id:"month", label:"月份計畫", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><rect x="3" y="4" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6"/><path d="M7 2v4M13 2v4M3 9h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
  { id:"daily", label:"當日記錄", icon:<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M4 6h12M4 10h8M4 14h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg> },
];

function PlannerApp({ user, token, saving, setSaving, plannerName, onOpenSettings }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [tab, setTab] = useState(0);
  const touchStart = useRef(null);

  const handleTouchStart = e => { touchStart.current = e.touches[0].clientX; };
  const handleTouchEnd = e => {
    if (!touchStart.current) return;
    const diff = touchStart.current - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 50) {
      if (diff > 0 && tab < 2) setTab(t => t+1);
      if (diff < 0 && tab > 0) setTab(t => t-1);
    }
    touchStart.current = null;
  };

  const yearOptions = Array.from({length:11}, (_,i) => thisYear-2+i);

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", background:C.bg }}>
      {/* Header */}
      <div style={{ padding:"16px 20px 14px", background:C.bg, flexShrink:0, borderBottom:`1px solid ${C.border}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:18, fontFamily:"'Noto Serif TC',serif", fontWeight:700, color:C.text }}>{plannerName}</div>
          {tab !== 2 && (
            <select value={year} onChange={e=>setYear(Number(e.target.value))}
              style={{ border:`1.5px solid ${C.border}`, borderRadius:10, padding:"6px 10px", fontSize:14, color:C.text, background:C.card, outline:"none", cursor:"pointer" }}>
              {yearOptions.map(y=><option key={y} value={y}>{y} 年</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Panels */}
      <div style={{ flex:1, overflow:"hidden" }} onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div style={{ display:"flex", width:"300%", height:"100%", transform:`translateX(${-tab*33.333}%)`, transition:"transform 0.38s cubic-bezier(0.4,0,0.2,1)" }}>
          <div style={{ width:"33.333%", height:"100%", overflowY:"auto", flexShrink:0 }}>
            <YearGoals user={user} token={token} saving={saving.goals} setSaving={setSaving} year={year} />
          </div>
          <div style={{ width:"33.333%", height:"100%", overflowY:"auto", flexShrink:0 }}>
            <MonthPlanner user={user} token={token} saving={saving.month} setSaving={setSaving} year={year} />
          </div>
          <div style={{ width:"33.333%", height:"100%", overflowY:"auto", flexShrink:0 }}>
            <DailyNote user={user} token={token} saving={saving.daily} setSaving={setSaving} />
          </div>
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ background:"rgba(247,245,242,0.95)", backdropFilter:"blur(16px)", borderTop:`1px solid ${C.border}`, display:"flex", padding:"10px 0 28px", flexShrink:0 }}>
        {TABS.map((t,i)=>(
          <button key={t.id} onClick={()=>setTab(i)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, background:"none", border:"none", cursor:"pointer", padding:"4px 0", color:tab===i?C.accent:C.sub, transition:"color 0.2s" }}>
            {t.icon}
            <div style={{ fontSize:10, fontWeight:tab===i?600:400 }}>{t.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}