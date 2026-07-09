// ── build.js ───────────────────────────────────────────────
// 建置腳本：把前端的 JSX 原始碼（*.js，用 React.createElement 語法糖寫的）
// 預先編譯成瀏覽器能直接執行的純 JS，輸出到 dist/。
//
// 為什麼要這個：原本瀏覽器每次打開網頁，都要下載 Babel 編譯器本體、
// 現場把 7、8 個檔案的 JSX 編譯成 JS 才能開始畫面渲染，這是網頁「打開很慢」
// 的主因。改成「部署前先編譯好」之後，瀏覽器拿到的就是普通 JS，
// 不用再現場編譯，開啟速度會明顯變快（尤其是手機）。
//
// 使用方式： node build.js　（或 npm run build）
// 本機開發／npm run dev 也會先跑這個，確保本機看到的跟正式站一致。

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

const ROOT = __dirname;
const OUT = path.join(ROOT, "dist");

// 這些 .js 檔案不是前端 JSX 原始碼（不用編譯、也不用出現在 dist/ 裡）
const EXCLUDE_JS = new Set(["server.js", "build.js", "sw.js"]);

// 純靜態檔案，原封不動複製到 dist/
const STATIC_FILES = ["index.html", "manifest.json", "icon.png", "sw.js"];

function log(msg) { console.log(msg); }

// 1. 清空並重建 dist/
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// 2. 編譯所有前端 JSX 檔案（自動抓根目錄下所有 .js，排除上面那份清單）
//    好處：之後新增模組檔案（例如以後又加一個新模組）不用回來改這支腳本
const jsFiles = fs.readdirSync(ROOT).filter(f => f.endsWith(".js") && !EXCLUDE_JS.has(f));

if (jsFiles.length === 0) {
  console.error("❌ 找不到任何要編譯的 .js 檔案，請確認是否在專案根目錄執行");
  process.exit(1);
}

let hasError = false;
for (const file of jsFiles) {
  const srcPath = path.join(ROOT, file);
  const code = fs.readFileSync(srcPath, "utf8");
  try {
    const result = babel.transformSync(code, {
      presets: [["@babel/preset-react", { runtime: "classic" }]],
      sourceType: "script",
      filename: file,
    });
    fs.writeFileSync(path.join(OUT, file), result.code);
    log(`✓ 編譯完成：${file}`);
  } catch (e) {
    hasError = true;
    console.error(`❌ 編譯失敗：${file}`);
    console.error(`   ${e.message}`);
  }
}

if (hasError) {
  console.error("\n建置失敗，請修正上面列出的語法錯誤後再試一次。");
  process.exit(1);
}

// 3. 複製靜態檔案
for (const file of STATIC_FILES) {
  const srcPath = path.join(ROOT, file);
  if (!fs.existsSync(srcPath)) {
    console.error(`❌ 找不到靜態檔案：${file}`);
    process.exit(1);
  }
  fs.copyFileSync(srcPath, path.join(OUT, file));
  log(`✓ 複製完成：${file}`);
}

log(`\n🎉 建置完成，共編譯 ${jsFiles.length} 個檔案，輸出在 dist/`);