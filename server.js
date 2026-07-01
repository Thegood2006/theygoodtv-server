// ═══════════════════════════════════════════════════════
//   THEY GOOD TV — SERVER v5.0
//   Render.com · Node 18+ · Express + Puppeteer
// ═══════════════════════════════════════════════════════

const express    = require("express");
const cors       = require("cors");
const https      = require("https");
const http       = require("http");
const puppeteer  = require("puppeteer");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── CORS abierto ──────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── URLs base ─────────────────────────────────────────
const GITHUB_RAW   = "https://raw.githubusercontent.com/Thegood2006/MI-sitio-eventos/main";
const CANALES_URL  = GITHUB_RAW + "/canales.json";

// ═══════════════════════════════════════════════════════
//   CACHÉ EN MEMORIA · TTL 50 min
// ═══════════════════════════════════════════════════════
const CACHE_TTL = 50 * 60 * 1000;
let cacheCanales  = null;
let cacheTiempo   = 0;

async function obtenerCanales() {
  if (cacheCanales && Date.now() - cacheTiempo < CACHE_TTL) {
    return cacheCanales;
  }
  const data = await fetchJson(CANALES_URL);
  cacheCanales = data;
  cacheTiempo  = Date.now();
  return data;
}

// ═══════════════════════════════════════════════════════
//   CANALES CON STREAM FIJO HARDCODED
//   (los dinámicos se extraen con Puppeteer)
// ═══════════════════════════════════════════════════════

// Estructura: id → { nombre, url, embedFijo: { tipo, embed } }
// tipo puede ser "m3u8" o "iframe"
const CANALES_SERVER = {

  // ── ECUADOR ──────────────────────────────────────────
  "teleamazonas": {
    nombre: "Teleamazonas",
    url: "https://teleamazonas.com/envivo",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://teleamazonas-live.cdn.vustreams.com/live/fd4ab346-b4e3-4628-abf0-b5a1bc192428/live.isml/fd4ab346-b4e3-4628-abf0-b5a1bc192428.m3u8",
      fuente: "manual"
    }
  },
  "dw-espanol": {
    nombre: "DW Español",
    url: "https://www.dw.com/es/television-en-vivo/s-100837",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8",
      fuente: "manual"
    }
  },
  "euronews": {
    nombre: "Euronews Español",
    url: "https://es.euronews.com/live",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://rakuten-euronews-1-es.samsung.wurl.tv/manifest/playlist.m3u8",
      fuente: "manual"
    }
  },
  "america-estereo": {
    nombre: "América Estéreo",
    url: "https://video.makrodigital.com/americaestereoguayaquil",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://video.makrodigital.com/americaestereoguayaquil/americaestereoguayaquil/playlist.m3u8",
      fuente: "manual"
    }
  },
  "zaracay": {
    nombre: "Zaracay TV",
    url: "https://video2.makrodigital.com/zaracay",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://video2.makrodigital.com/zaracay/zaracay/playlist.m3u8",
      fuente: "manual"
    }
  },
  "tctelevision": {
    nombre: "TC Televisión",
    url: "https://tctelevision.com/envivo/",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://tctelevision.com/envivo/",
      fuente: "manual"
    }
  },
  "tvc": {
    nombre: "TVC Ecuador",
    url: "https://www.tvc.com.ec/envivo/",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://www.tvc.com.ec/envivo/",
      fuente: "manual"
    }
  },

  // ── DEPORTES (iFrames dinámicos de moviedays) ─────────
  "espn-live": {
    nombre: "ESPN Live",
    url: "https://moviedays.top/embed-live1.php?v=espn",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://moviedays.top/embed-live1.php?v=espn",
      fuente: "manual"
    }
  },
  "deportes-1": {
    nombre: "Deportes Canal 1",
    url: "https://moviedays.top/embed-live2.php",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://moviedays.top/embed-live2.php",
      fuente: "manual"
    }
  },
  "deportes-2": {
    nombre: "Deportes Canal 2",
    url: "https://moviedays.top/embed-live3.php",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://moviedays.top/embed-live3.php",
      fuente: "manual"
    }
  },

  // ── ENTRETENIMIENTO ───────────────────────────────────
  "disney": {
    nombre: "Disney Channel",
    url: "https://moviedays.top/embed-live3.php",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://moviedays.top/embed-live3.php",
      fuente: "manual"
    }
  },
  "star": {
    nombre: "Star Channel",
    url: "https://moviedays.top/embed-live2.php",
    embedFijo: {
      tipo:  "iframe",
      embed: "https://moviedays.top/embed-live1.php?v=starchannel",
      fuente: "manual"
    }
  },

};

// ═══════════════════════════════════════════════════════
//   PUPPETEER — caché de streams extraídos
// ═══════════════════════════════════════════════════════
const streamCache = {};
const STREAM_TTL  = 30 * 60 * 1000; // 30 min

async function extraerStreamConPuppeteer(url) {
  const ahora = Date.now();
  if (streamCache[url] && ahora - streamCache[url].t < STREAM_TTL) {
    return streamCache[url].embed;
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--no-first-run",
        "--no-zygote",
        "--single-process",
      ],
    });

    const page = await browser.newPage();
    let streamUrl = null;

    // Interceptar peticiones de red buscando m3u8
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes(".m3u8") && !streamUrl) {
        streamUrl = u;
      }
      req.continue();
    });

    await page.goto(url, { waitUntil: "networkidle2", timeout: 25000 });

    // Esperar un poco más por si el stream carga tarde
    await new Promise((r) => setTimeout(r, 5000));

    if (streamUrl) {
      streamCache[url] = { embed: streamUrl, t: Date.now() };
      return streamUrl;
    }

    // Si no encontró m3u8, devolver el iframe original
    return url;
  } catch (e) {
    console.error("Puppeteer error:", e.message);
    return url; // fallback
  } finally {
    if (browser) await browser.close();
  }
}

// ═══════════════════════════════════════════════════════
//   HELPERS
// ═══════════════════════════════════════════════════════
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, { headers: { "User-Agent": "TGTV-Server/5.0" } }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error: " + e.message)); }
      });
    }).on("error", reject);
  });
}

// Genera el HTML del reproductor embebido
function playerHTML(canal, embed) {
  const tipo = embed.tipo || "m3u8";
  let playerInner = "";

  if (tipo === "iframe") {
    playerInner = `
      <iframe
        src="${embed.embed}"
        allowfullscreen
        allow="autoplay; fullscreen"
        style="width:100%;height:100%;border:none;display:block;"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
      ></iframe>`;
  } else {
    // m3u8 → HLS.js
    playerInner = `
      <video id="vid" autoplay controls playsinline
        style="width:100%;height:100%;background:#000;display:block;"></video>
      <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"><\/script>
      <script>
        const src = "${embed.embed}";
        const vid = document.getElementById("vid");
        if (Hls.isSupported()) {
          const hls = new Hls({ enableWorker: false });
          hls.loadSource(src);
          hls.attachMedia(vid);
        } else if (vid.canPlayType("application/vnd.apple.mpegurl")) {
          vid.src = src;
        }
      <\/script>`;
  }

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${canal.nombre} — THEY GOOD TV</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:100%;height:100%;background:#000;overflow:hidden}
</style>
</head>
<body>${playerInner}</body>
</html>`;
}

// ═══════════════════════════════════════════════════════
//   PÁGINA DE INICIO (index.html bonito del status)
// ═══════════════════════════════════════════════════════
app.get("/", (req, res) => {
  const startTime = process.uptime();
  const h = Math.floor(startTime / 3600);
  const m = Math.floor((startTime % 3600) / 60);
  const s = Math.floor(startTime % 60);
  const uptime = `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>THEY GOOD TV — API</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--cyan:#00e5ff;--purple:#7c3aed;--green:#00ff88;--red:#ff3d5a;--yellow:#ffc800;--bg:#04040f;--bg2:#08081a;--bg3:#0d0d22;--border:rgba(0,229,255,0.15)}
  body{background:var(--bg);color:#fff;font-family:'Share Tech Mono',monospace;min-height:100vh;overflow-x:hidden}
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,229,255,0.03)1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03)1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
  .wrap{position:relative;z-index:1;max-width:900px;margin:0 auto;padding:40px 20px}
  header{text-align:center;padding:60px 20px 40px;position:relative;z-index:1}
  .logo-ring{display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:2px solid var(--cyan);box-shadow:0 0 30px rgba(0,229,255,0.3);margin-bottom:20px;animation:pulse 3s ease-in-out infinite;font-size:2rem}
  @keyframes pulse{0%,100%{box-shadow:0 0 20px rgba(0,229,255,0.3)}50%{box-shadow:0 0 50px rgba(0,229,255,0.6)}}
  h1{font-family:'Orbitron',sans-serif;font-size:clamp(1.5rem,5vw,2.8rem);font-weight:900;letter-spacing:0.08em;background:linear-gradient(90deg,var(--cyan),#fff,var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:8px}
  .subtitle{color:rgba(255,255,255,0.4);font-size:0.75rem;letter-spacing:3px;text-transform:uppercase}
  .status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);color:var(--green);border-radius:30px;padding:8px 20px;font-size:0.75rem;letter-spacing:2px;margin-top:20px}
  .dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:blink 1.5s ease-in-out infinite}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:24px}
  .card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;transition:.3s}
  .card:hover{border-color:rgba(0,229,255,0.4);transform:translateY(-3px)}
  .card-icon{font-size:2rem;margin-bottom:12px}
  .card-label{font-size:0.6rem;letter-spacing:3px;color:var(--cyan);text-transform:uppercase;margin-bottom:6px}
  .card-value{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:700;color:#fff}
  .card-sub{font-size:0.65rem;color:rgba(255,255,255,0.3);margin-top:4px}
  .section-title{font-family:'Orbitron',sans-serif;font-size:0.8rem;color:var(--cyan);letter-spacing:3px;margin-bottom:16px;display:flex;align-items:center;gap:10px}
  .section-title::after{content:'';flex:1;height:1px;background:var(--border)}
  .endpoint-list{display:flex;flex-direction:column;gap:10px;margin-bottom:30px}
  .endpoint{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:14px;transition:.2s;cursor:pointer;text-decoration:none;color:inherit}
  .endpoint:hover{border-color:rgba(0,229,255,0.4)}
  .method{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;padding:4px 10px;border-radius:6px;flex-shrink:0;letter-spacing:1px;background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.4);color:var(--cyan)}
  .ep-path{font-family:'Share Tech Mono',monospace;font-size:0.85rem;color:#fff;flex:1}
  .ep-desc{font-size:0.65rem;color:rgba(255,255,255,0.4);text-align:right;flex-shrink:0}
  .terminal{background:#020208;border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:30px}
  .terminal-bar{background:var(--bg3);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:8px;font-size:0.7rem;color:rgba(255,255,255,0.4)}
  .dt{width:10px;height:10px;border-radius:50%}.dt.r{background:#ff5f57}.dt.y{background:#febc2e}.dt.g{background:#28c840}
  .terminal-body{padding:20px;font-size:0.78rem;line-height:2;color:rgba(255,255,255,0.6);min-height:120px}
  .log-line{display:flex;gap:12px}
  .log-time{color:rgba(0,229,255,0.5);flex-shrink:0}
  .log-ok{color:var(--green)}.log-warn{color:var(--yellow)}.log-info{color:var(--cyan)}
  .ping-btn{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,rgba(0,229,255,0.15),rgba(124,58,237,0.15));border:1px solid var(--cyan);border-radius:12px;padding:14px 28px;color:var(--cyan);font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:700;letter-spacing:2px;cursor:pointer;transition:.3s;text-decoration:none}
  .ping-btn:hover{box-shadow:0 0 30px rgba(0,229,255,0.3);transform:scale(1.02)}
  .footer{text-align:center;padding:40px 0 20px;color:rgba(255,255,255,0.2);font-size:0.65rem;letter-spacing:2px}
</style>
</head>
<body>
<header>
  <div class="logo-ring">📡</div>
  <h1>THEY GOOD TV</h1>
  <p class="subtitle">Stream API Server</p>
  <div class="status-badge"><span class="dot"></span> SERVIDOR ACTIVO</div>
</header>
<div class="wrap">
  <div class="grid">
    <div class="card"><div class="card-icon">⚡</div><div class="card-label">Estado</div><div class="card-value" style="color:var(--green)">ONLINE</div><div class="card-sub">Render.com · Free Plan</div></div>
    <div class="card"><div class="card-icon">🕐</div><div class="card-label">Tiempo activo</div><div class="card-value">${uptime}</div><div class="card-sub">Desde último reinicio</div></div>
    <div class="card"><div class="card-icon">🔄</div><div class="card-label">Caché canales</div><div class="card-value">50 min</div><div class="card-sub">Renovación automática</div></div>
  </div>
  <div class="section-title">ENDPOINTS DISPONIBLES</div>
  <div class="endpoint-list">
    <a class="endpoint" href="/streams" target="_blank"><span class="method">GET</span><span class="ep-path">/streams</span><span class="ep-desc">Todos los canales</span></a>
    <a class="endpoint" href="/canales" target="_blank"><span class="method">GET</span><span class="ep-path">/canales</span><span class="ep-desc">Lista del servidor</span></a>
    <a class="endpoint" href="/canal/dw-espanol" target="_blank"><span class="method">GET</span><span class="ep-path">/canal/:nombre</span><span class="ep-desc">Link de un canal</span></a>
    <a class="endpoint" href="/live/dw-espanol/player" target="_blank"><span class="method">GET</span><span class="ep-path">/live/:id/player</span><span class="ep-desc">Reproductor embebible</span></a>
    <a class="endpoint" href="/proxy?url=" target="_blank"><span class="method">GET</span><span class="ep-path">/proxy?url=...</span><span class="ep-desc">Proxy CORS</span></a>
    <a class="endpoint" href="/health" target="_blank"><span class="method">GET</span><span class="ep-path">/health</span><span class="ep-desc">Estado del servidor</span></a>
  </div>
  <div class="section-title">ACTIVITY LOG</div>
  <div class="terminal">
    <div class="terminal-bar"><span class="dt r"></span><span class="dt y"></span><span class="dt g"></span>&nbsp; theygoodtv-server — bash</div>
    <div class="terminal-body">
      <div class="log-line"><span class="log-time">--:--:--</span><span class="log-ok">✓ Servidor iniciado en puerto ${PORT}</span></div>
      <div class="log-line"><span class="log-time">--:--:--</span><span class="log-info">→ CORS habilitado para todos los orígenes</span></div>
      <div class="log-line"><span class="log-time">--:--:--</span><span class="log-ok">✓ Caché en memoria activa · TTL: 50 min</span></div>
      <div class="log-line"><span class="log-time">--:--:--</span><span class="log-ok">✓ Puppeteer listo para extracción dinámica</span></div>
      <div class="log-line"><span class="log-time">--:--:--</span><span class="log-warn">⚠ Plan Free: servidor duerme tras 15 min sin uso</span></div>
    </div>
  </div>
  <div style="text-align:center;margin-bottom:30px">
    <a class="ping-btn" href="/health" target="_blank">📶 VERIFICAR ESTADO</a>
  </div>
  <div class="footer">THEY GOOD TV API · theygoodtv-server.onrender.com · v5.0.0</div>
</div>
</body>
</html>`);
});

// ═══════════════════════════════════════════════════════
//   GET /health
// ═══════════════════════════════════════════════════════
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    time:   new Date().toISOString(),
    version: "5.0.0",
    canalesServer: Object.keys(CANALES_SERVER).length,
  });
});

// ═══════════════════════════════════════════════════════
//   GET /canales
//   Devuelve la lista de canales del servidor (para el admin)
// ═══════════════════════════════════════════════════════
app.get("/canales", (req, res) => {
  const lista = Object.entries(CANALES_SERVER).map(([id, c]) => ({
    id,
    nombre:          c.nombre,
    tieneStreamFijo: !!c.embedFijo,
    tipo:            c.embedFijo ? c.embedFijo.tipo : "dinamico",
  }));
  res.json({ canales: lista, total: lista.length });
});

// ═══════════════════════════════════════════════════════
//   GET /streams
//   Devuelve todos los canales del JSON de GitHub
//   más los del servidor, fusionados
// ═══════════════════════════════════════════════════════
app.get("/streams", async (req, res) => {
  try {
    const gh = await obtenerCanales();

    // Aplana todos los canales del JSON
    const categorias = ["futbol","ciclismo","ufc","ecuador","internacional","eventos"];
    const todos = [];
    categorias.forEach((cat) => {
      (gh[cat] || []).forEach((c) => {
        todos.push({ ...c, categoria: cat });
      });
    });

    // Agrega los del servidor que no estén ya
    Object.entries(CANALES_SERVER).forEach(([id, c]) => {
      todos.push({
        id,
        nombre:      c.nombre,
        categoria:   "servidor",
        tipo:        c.embedFijo ? c.embedFijo.tipo : "dinamico",
        reproductores: c.embedFijo
          ? [c.embedFijo.embed]
          : [req.protocol + "://" + req.get("host") + "/live/" + id + "/player"],
      });
    });

    res.json({ ok: true, total: todos.length, canales: todos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
//   GET /canal/:nombre
//   Devuelve el stream de un canal por nombre (del JSON de GitHub)
// ═══════════════════════════════════════════════════════
app.get("/canal/:nombre", async (req, res) => {
  try {
    const gh   = await obtenerCanales();
    const name = req.params.nombre.toLowerCase();

    // Buscar en todas las categorías
    let encontrado = null;
    const cats = ["futbol","ciclismo","ufc","ecuador","internacional","eventos"];
    for (const cat of cats) {
      const lista = gh[cat] || [];
      encontrado = lista.find(
        (c) => c.nombre && c.nombre.toLowerCase().replace(/\s+/g, "-") === name
      );
      if (encontrado) break;
    }

    if (!encontrado) {
      return res.status(404).json({ ok: false, error: "Canal no encontrado" });
    }

    res.json({
      ok:    true,
      canal: encontrado.nombre,
      tipo:  encontrado.tipo || "m3u8",
      links: encontrado.reproductores || [],
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
//   GET /live/:id
//   Devuelve el embed de un canal del servidor en JSON
// ═══════════════════════════════════════════════════════
app.get("/live/:id", async (req, res) => {
  const id     = req.params.id;
  const canal  = CANALES_SERVER[id];

  if (!canal) {
    return res.status(404).json({ ok: false, error: "Canal no encontrado: " + id });
  }

  // Si tiene stream fijo, devolverlo directo
  if (canal.embedFijo) {
    return res.json({
      ok:    true,
      id,
      nombre: canal.nombre,
      embed:  canal.embedFijo.embed,
      tipo:   canal.embedFijo.tipo,
      fuente: canal.embedFijo.fuente || "manual",
    });
  }

  // Si no, extraer con Puppeteer
  try {
    const embed = await extraerStreamConPuppeteer(canal.url);
    res.json({
      ok:     true,
      id,
      nombre: canal.nombre,
      embed,
      tipo:   embed.includes(".m3u8") ? "m3u8" : "iframe",
      fuente: "puppeteer",
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ═══════════════════════════════════════════════════════
//   GET /live/:id/player
//   Devuelve un HTML listo para embeber en un iframe
// ═══════════════════════════════════════════════════════
app.get("/live/:id/player", async (req, res) => {
  const id    = req.params.id;
  const canal = CANALES_SERVER[id];

  if (!canal) {
    return res.status(404).send(`<html><body style="background:#000;color:#ff3d5a;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:1.2rem;">
      ❌ Canal "${id}" no encontrado</body></html>`);
  }

  let embedData = canal.embedFijo;

  if (!embedData) {
    try {
      const embed = await extraerStreamConPuppeteer(canal.url);
      embedData = {
        embed,
        tipo: embed.includes(".m3u8") ? "m3u8" : "iframe",
      };
    } catch (e) {
      return res.status(500).send(`<html><body style="background:#000;color:#ff3d5a;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;">
        ❌ Error extrayendo stream: ${e.message}</body></html>`);
    }
  }

  res.setHeader("Content-Type", "text/html");
  res.send(playerHTML(canal, embedData));
});

// ═══════════════════════════════════════════════════════
//   GET /proxy?url=...
//   Proxy CORS simple para streams m3u8 / recursos
// ═══════════════════════════════════════════════════════
app.get("/proxy", (req, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ ok: false, error: "Falta parámetro url" });
  }

  const lib = target.startsWith("https") ? https : http;

  lib.get(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TGTV/5.0)",
      "Origin":     "https://theygoodtv-server.onrender.com",
      "Referer":    "https://theygoodtv-server.onrender.com/",
    },
  }, (upstream) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", upstream.headers["content-type"] || "application/octet-stream");
    upstream.pipe(res);
  }).on("error", (e) => {
    res.status(500).json({ ok: false, error: e.message });
  });
});

// ═══════════════════════════════════════════════════════
//   INIT
// ═══════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`\n  ████████╗ ██████╗ ████████╗██╗   ██╗`);
  console.log(`     ██╔══╝██╔════╝    ██╔══╝██║   ██║`);
  console.log(`     ██║   ██║  ███╗   ██║   ██║   ██║`);
  console.log(`     ██║   ██║   ██║   ██║   ╚██╗ ██╔╝`);
  console.log(`     ██║   ╚██████╔╝   ██║    ╚████╔╝ `);
  console.log(`     ╚═╝    ╚═════╝    ╚═╝     ╚═══╝  \n`);
  console.log(`  THEY GOOD TV — Server v5.0`);
  console.log(`  Puerto: ${PORT}`);
  console.log(`  Canales hardcoded: ${Object.keys(CANALES_SERVER).length}`);
  console.log(`  Caché TTL: 50 min\n`);
});
