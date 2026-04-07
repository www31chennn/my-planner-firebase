// ── subscriptions.js ──────────────────────────────────────
// 訂閱管理模組

const CURRENCIES = ["NT$", "USD"];
const CYCLES = ["月付", "年付"];
const USD_TO_NTD = 32; // 匯率，之後可以改

// 8 個常用服務（顯示在快選按鈕）
const QUICK_PICKS = [
  { name:"Netflix",      domain:"netflix.com" },
  { name:"Disney+",      domain:"disneyplus.com" },
  { name:"YouTube",      domain:"youtube.com" },
  { name:"Apple Music",  domain:"music.apple.com" },
  { name:"iCloud",       domain:"icloud.com" },
  { name:"Google One",   domain:"one.google.com" },
  { name:"Claude",       domain:"claude.ai" },
  { name:"ChatGPT",      domain:"chatgpt.com" },
  { name:"Gemini",       domain:"gemini.google.com" },
];

// 完整搜尋清單（輸入時比對）
const PRESETS = [
  { name:"Netflix",        domain:"netflix.com" },
  { name:"YouTube",        domain:"youtube.com" },
  { name:"Disney+",        domain:"disneyplus.com" },
  { name:"Apple TV+",      domain:"tv.apple.com" },
  { name:"Spotify",        domain:"spotify.com" },
  { name:"Apple Music",    domain:"music.apple.com" },
  { name:"KKBOX",          domain:"kkbox.com" },
  { name:"iCloud",         domain:"icloud.com" },
  { name:"Google One",     domain:"one.google.com" },
  { name:"Dropbox",        domain:"dropbox.com" },
  { name:"Microsoft 365",  domain:"microsoft.com" },
  { name:"OneDrive",       domain:"onedrive.live.com" },
  { name:"Claude",         domain:"claude.ai" },
  { name:"ChatGPT",        domain:"chatgpt.com" },
  { name:"Gemini",         domain:"gemini.google.com" },
  { name:"Perplexity",     domain:"perplexity.ai" },
  { name:"Midjourney",     domain:"midjourney.com" },
  { name:"Notion",         domain:"notion.so" },
  { name:"Canva",          domain:"canva.com" },
  { name:"Adobe",          domain:"adobe.com" },
  { name:"GitHub",         domain:"github.com" },
  { name:"Figma",          domain:"figma.com" },
  { name:"Slack",          domain:"slack.com" },
  { name:"Zoom",           domain:"zoom.us" },
  { name:"LINE",           domain:"line.me" },
  { name:"Google Play",    domain:"play.google.com" },
  { name:"App Store",      domain:"apps.apple.com" },
];

function searchPresets(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase();
  return PRESETS.filter(p => p.name.toLowerCase().includes(q)).slice(0, 5);
}

function getLogoUrl(domain, name) {
  // 有網域直接用，沒有就用名稱猜
  let d = domain;
  if (!d && name) {
    d = name.toLowerCase().replace(/\s+/g, "") + ".com";
  }
  if (!d) return null;
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim();
  return `https://www.google.com/s2/favicons?domain=${d}&sz=64`;
}

function toMonthlyNTD(amount, currency, cycle) {
  const ntd = currency === "USD" ? amount * USD_TO_NTD : amount;
  return cycle === "年付" ? ntd / 12 : ntd;
}

// ── 新增/編輯 Modal ────────────────────────────────────────
function SubModal({ sub, onSave, onClose }) {
  const [name, setName] = useState(sub?.name || "");
  const [domain, setDomain] = useState(sub?.domain || "");
  const [amount, setAmount] = useState(sub?.amount || "");
  const [currency, setCurrency] = useState(sub?.currency || "NT$");
  const [cycle, setCycle] = useState(sub?.cycle || "月付");
  const [card, setCard] = useState(sub?.card || "");
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [emoji, setEmoji] = useState(sub?.emoji || "");
  const [logoFailed, setLogoFailed] = useState(false);
  const [showEmojiInput, setShowEmojiInput] = useState(false);

  const logoUrl = getLogoUrl(domain, name);

  function handleSave() {
    if (!name.trim() || !amount) return;
    setSaving(true);
    onSave({
      id: sub?.id || Date.now(),
      name: name.trim(),
      domain: domain.trim(),
      emoji: emoji.trim(),
      amount: parseFloat(amount),
      currency,
      cycle,
      card: card.trim(),
    });
  }

  const inp = { width:"100%", border:`1.5px solid ${C.border}`, borderRadius:10, padding:"10px 14px", fontSize:15, color:C.text, background:C.bg, outline:"none" };
  const label = { fontSize:12, color:C.sub, marginBottom:6 };

  return (
    <div className="fade-in" style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:300, display:"flex", alignItems:"flex-end" }}>
      <div style={{ width:"100%", maxWidth:430, margin:"0 auto", background:C.card, borderRadius:"20px 20px 0 0", padding:"24px 20px 48px", maxHeight:"90vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
          <div style={{ fontSize:18, fontWeight:700, color:C.text }}>{sub ? "編輯訂閱" : "新增訂閱"}</div>
          <button onClick={onClose} style={{ background:C.border, border:"none", borderRadius:10, width:32, height:32, cursor:"pointer", fontSize:16 }}>✕</button>
        </div>

        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* 8 個快選按鈕 */}
          {!sub && (
            <div>
              <div style={{ fontSize:12, color:C.sub, marginBottom:8 }}>快速選擇</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {QUICK_PICKS.map(p => {
                  const selected = name === p.name;
                  return (
                    <button key={p.name} onClick={()=>{ setName(p.name); setDomain(p.domain); setLogoFailed(false); setEmoji(""); setSuggestions([]); }}
                      style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 12px", borderRadius:20, border:`1.5px solid ${selected?C.accent:C.border}`, background:selected?C.accentLight:C.card, cursor:"pointer", transition:"all 0.15s" }}>
                      <img src={getLogoUrl(p.domain, p.name)} width={16} height={16} style={{ objectFit:"contain" }} onError={e=>e.target.style.display="none"} />
                      <span style={{ fontSize:13, fontWeight:selected?600:400, color:selected?C.accent:C.text }}>{p.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Logo 預覽 + 名稱輸入 */}
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <div
              onClick={()=>{ if(name.trim()) setShowEmojiInput(true); }}
              style={{ width:48, height:48, borderRadius:12, background:C.bg, border:`1.5px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0, cursor:name.trim()?"pointer":"default" }}>
              {emoji ? (
                <span style={{ fontSize:26, lineHeight:1 }}>{emoji}</span>
              ) : logoUrl && !logoFailed ? (
                <img src={logoUrl} width={32} height={32} style={{ objectFit:"contain" }} onError={()=>setLogoFailed(true)} />
              ) : (
                <span style={{ fontSize:22, opacity:0.3, lineHeight:1 }}>📦</span>
              )}
            </div>
            {showEmojiInput && ReactDOM.createPortal(
              <div id="emoji-backdrop" style={{ position:"fixed", inset:0, zIndex:999, display:"flex", alignItems:"center", justifyContent:"center", background:"rgba(0,0,0,0.15)" }}
                onClick={()=>setShowEmojiInput(false)}>
                <div className="pop-in" onClick={e=>e.stopPropagation()}
                  style={{ background:C.card, borderRadius:16, padding:16, boxShadow:"0 8px 40px rgba(0,0,0,0.2)", width:220, margin:20 }}>
                  <div style={{ fontSize:11, color:C.sub, marginBottom:10, textAlign:"center" }}>選擇或輸入圖示</div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:10, justifyContent:"center" }}>
                    {["🎵","📱","☁️","🤖","🎬","🎮","📧","💼","🔧","📚","🏋️","✈️","🎯","💡","🌐","🎨"].map(em=>(
                      <button key={em} onClick={()=>{ setEmoji(em); setShowEmojiInput(false); }}
                        style={{ fontSize:22, background:emoji===em?C.accentLight:"none", border:`1.5px solid ${emoji===em?C.accent:"transparent"}`, cursor:"pointer", borderRadius:8, padding:4, lineHeight:1 }}>{em}</button>
                    ))}
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <input value={emoji} onChange={e=>setEmoji(e.target.value)} placeholder="自訂"
                      maxLength={2} style={{ width:52, border:`1.5px solid ${C.border}`, borderRadius:8, padding:"8px 0", fontSize:emoji?22:13, outline:"none", background:C.bg, textAlign:"center", flexShrink:0 }} />
                    <button onClick={()=>setShowEmojiInput(false)}
                      style={{ flex:1, background:C.accent, color:"#fff", border:"none", borderRadius:8, padding:"8px 0", cursor:"pointer", fontSize:13, fontWeight:600 }}>好</button>
                  </div>
                </div>
              </div>,
              document.body
            )}
            <div style={{ flex:1 }}>
              <div style={label}>服務名稱</div>
              <input value={name} onChange={e=>{ setName(e.target.value); setDomain(""); setLogoFailed(false); setEmoji(""); setSuggestions(searchPresets(e.target.value)); }}
                placeholder="或自行輸入名稱…" style={inp} autoComplete="off" />
            </div>
          </div>

          {/* 搜尋建議 - 絕對定位蓋住下方欄位 */}
          <div style={{ position:"relative" }}>
            {suggestions.length > 0 && (
              <div style={{ position:"absolute", top:0, left:0, right:0, background:C.card, border:`1.5px solid ${C.border}`, borderRadius:12, overflow:"hidden", boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:50 }}>
                {suggestions.map((p,i) => (
                  <button key={p.name+i} onClick={()=>{ setName(p.name); setDomain(p.domain); setLogoFailed(false); setEmoji(""); setSuggestions([]); }}
                    style={{ width:"100%", display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:"none", border:"none", borderBottom:i<suggestions.length-1?`1px solid ${C.border}`:"none", cursor:"pointer", textAlign:"left" }}>
                    <div style={{ width:28, height:28, borderRadius:8, background:C.bg, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
                      <img src={getLogoUrl(p.domain, p.name)} width={20} height={20} style={{ objectFit:"contain" }} onError={e=>e.target.style.display="none"} />
                    </div>
                    <span style={{ fontSize:14, color:C.text }}>{p.name}</span>
                    <span style={{ fontSize:11, color:C.sub, marginLeft:"auto" }}>{p.domain}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 金額 + 幣別 */}
          <div>
            <div style={label}>金額</div>
            <div style={{ display:"flex", gap:8 }}>
              <input type="number" inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" style={{ ...inp, flex:1 }} />
              <div style={{ display:"flex", background:C.border, borderRadius:10, padding:3, flexShrink:0 }}>
                {CURRENCIES.map(c => (
                  <button key={c} onClick={()=>setCurrency(c)}
                    style={{ padding:"8px 12px", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:currency===c?600:400, color:currency===c?C.text:C.sub, background:currency===c?C.card:"transparent", transition:"all 0.2s" }}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 計費週期 */}
          <div>
            <div style={label}>計費週期</div>
            <div style={{ display:"flex", background:C.border, borderRadius:10, padding:3 }}>
              {CYCLES.map(cy => (
                <button key={cy} onClick={()=>setCycle(cy)}
                  style={{ flex:1, padding:"9px 0", borderRadius:8, border:"none", cursor:"pointer", fontSize:13, fontWeight:cycle===cy?600:400, color:cycle===cy?C.text:C.sub, background:cycle===cy?C.card:"transparent", transition:"all 0.2s" }}>
                  {cy}
                </button>
              ))}
            </div>
          </div>

          {/* 信用卡 */}
          <div>
            <div style={label}>扣款信用卡</div>
            <input value={card} onChange={e=>setCard(e.target.value)} placeholder="例如：玉山 Wish 卡" style={inp} />
          </div>

          <button onClick={handleSave} disabled={saving || !name.trim() || !amount}
            style={{ width:"100%", padding:"14px 0", borderRadius:12, border:"none", background:C.accent, color:"#fff", fontSize:16, fontWeight:600, cursor:"pointer", opacity:(!name.trim()||!amount)?0.5:1, marginTop:8 }}>
            {saving ? "儲存中…" : "儲存"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── 訂閱卡片 ──────────────────────────────────────────────
function SubCard({ sub, onEdit, onDelete }) {
  const logoUrl = getLogoUrl(sub.domain, sub.name);
  const monthlyNTD = toMonthlyNTD(sub.amount, sub.currency, sub.cycle);

  return (
    <div className="fade-up" onClick={onEdit}
      style={{ background:C.card, borderRadius:16, padding:"16px", boxShadow:"0 1px 4px rgba(0,0,0,0.07)", display:"flex", alignItems:"center", gap:14, cursor:"pointer" }}>
      {/* Logo */}
      <div style={{ width:44, height:44, borderRadius:12, background:C.bg, border:`1.5px solid ${C.border}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
        {sub.emoji ? (
          <span style={{ fontSize:24, lineHeight:1 }}>{sub.emoji}</span>
        ) : (
          <img src={logoUrl} width={28} height={28} style={{ objectFit:"contain" }}
            onError={e=>{ e.target.style.display="none"; e.target.nextSibling.style.display="block"; }} />
        )}
        {!sub.emoji && <span style={{ fontSize:20, display:"none" }}>📦</span>}
      </div>

      {/* 資訊 */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:15, fontWeight:600, color:C.text, marginBottom:3 }}>{sub.name}</div>
        <div style={{ fontSize:12, color:C.sub, display:"flex", gap:8, flexWrap:"wrap" }}>
          {sub.card && <span>{sub.card}</span>}
          <span>{sub.cycle}</span>
        </div>
      </div>

      {/* 金額 + 刪除 */}
      <div style={{ textAlign:"right", flexShrink:0 }}>
        <div style={{ fontSize:16, fontWeight:700, color:C.text }}>
          {sub.currency === "USD" ? "$" : "NT$"}{sub.amount}
        </div>
        {sub.cycle === "年付" && (
          <div style={{ fontSize:11, color:C.sub }}>≈ NT${Math.round(monthlyNTD)}/月</div>
        )}
        {sub.currency === "USD" && (
          <div style={{ fontSize:11, color:C.sub }}>≈ NT${Math.round(sub.currency==="USD"?sub.amount*USD_TO_NTD:sub.amount)}</div>
        )}
        <button onClick={e=>{ e.stopPropagation(); onDelete(); }}
          style={{ marginTop:6, background:"none", border:"none", padding:0, cursor:"pointer", fontSize:12, color:C.red }}>
          刪除
        </button>
      </div>
    </div>
  );
}

// ── Subscriptions App ──────────────────────────────────────
function SubscriptionsApp({ user, token, saving, setSaving }) {
  const [subs, setSubs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editSub, setEditSub] = useState(null);
  const timer = useRef(null);

  // 個人資料，key 用 list
  const SHEET = "subscriptions";
  const KEY = `list`;

  useEffect(() => {
    // 先查快取
    if (cacheHas(user, SHEET, KEY)) {
      const cached = cacheGet(user, SHEET, KEY);
      try {
        if (!cached) { setSubs([]); }
        else if (Array.isArray(cached)) { setSubs(cached); }
        else { setSubs(JSON.parse(cached)); }
      } catch { setSubs([]); }
      setLoaded(true);
      return;
    }
    // 快取沒有才打 API
    apiCall({ action:"readOne", user, sheet:SHEET, key:KEY, token }).then(val => {
      const str = typeof val === "string" ? val : JSON.stringify(val||[]);
      cacheSet(user, SHEET, KEY, str);
      try {
        if (!val) { setSubs([]); }
        else if (Array.isArray(val)) { setSubs(val); }
        else { setSubs(JSON.parse(val)); }
      } catch { setSubs([]); }
      setLoaded(true);
    });
  }, []);

  function save(next) {
    setSubs(next);
    cacheSet(user, SHEET, KEY, JSON.stringify(next));
    setSaving(p=>({...p, subs:true}));
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      await writeOne(user, SHEET, KEY, JSON.stringify(next), token);
      setSaving(p=>({...p, subs:false}));
    }, 1500);
  }

  function handleSave(sub) {
    const next = editSub
      ? subs.map(s => s.id === sub.id ? sub : s)
      : [...subs, sub];
    save(next);
    setShowModal(false);
    setEditSub(null);
  }

  function handleDelete(id) {
    if (!confirm("確定要刪除這個訂閱嗎？")) return;
    save(subs.filter(s => s.id !== id));
  }

  // 統計本月總費用（NT$）
  const monthlyTotal = subs.reduce((sum, s) => sum + toMonthlyNTD(s.amount, s.currency, s.cycle), 0);
  const yearlyTotal = monthlyTotal * 12;

  if (!loaded) return <Spinner />;

  return (
    <div style={{ height:"100%", display:"flex", flexDirection:"column", background:C.bg, overflowY:"auto" }}>
      <div style={{ padding:"20px 20px 100px" }}>

        {/* 統計卡 */}
        <div style={{ background:`linear-gradient(135deg, ${C.accent}, ${C.accent}cc)`, borderRadius:20, padding:"20px 24px", marginBottom:24, color:"#fff", position:"relative" }}>
          <div style={{ fontSize:13, opacity:0.8, marginBottom:6 }}>本月訂閱總費用</div>
          <div style={{ fontSize:32, fontFamily:"'Noto Serif TC',serif", fontWeight:700, marginBottom:4 }}>
            NT$ {Math.round(monthlyTotal).toLocaleString()}
          </div>
          <div style={{ fontSize:13, opacity:0.7 }}>年費合計 NT$ {Math.round(yearlyTotal).toLocaleString()}</div>
          <div style={{ fontSize:12, opacity:0.6, marginTop:8 }}>共 {subs.length} 項訂閱 · 匯率 1 USD = {USD_TO_NTD} NT$</div>
        </div>

        {/* 訂閱列表 */}
        {subs.length === 0 ? (
          <div style={{ textAlign:"center", padding:"48px 0", color:C.sub }}>
            <div style={{ fontSize:40, marginBottom:12 }}>💳</div>
            <div style={{ fontSize:15, marginBottom:6 }}>還沒有訂閱</div>
            <div style={{ fontSize:13 }}>點下方 + 新增第一個</div>
          </div>
        ) : (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {subs.map(sub => (
              <SubCard key={sub.id} sub={sub}
                onEdit={()=>{ setEditSub(sub); setShowModal(true); }}
                onDelete={()=>handleDelete(sub.id)} />
            ))}
          </div>
        )}
      </div>

      {/* 新增按鈕 */}
      <button onClick={()=>{ setEditSub(null); setShowModal(true); }}
        style={{ position:"fixed", bottom:32, right:"calc(50% - 215px + 20px)", width:52, height:52, borderRadius:26, background:C.accent, border:"none", fontSize:26, display:"flex", alignItems:"center", justifyContent:"center", boxShadow:"0 4px 16px rgba(74,124,89,0.4)", cursor:"pointer", color:"#fff" }}>
        +
      </button>

      {showModal && (
        <SubModal
          sub={editSub}
          onSave={handleSave}
          onClose={()=>{ setShowModal(false); setEditSub(null); }}
        />
      )}
    </div>
  );
}