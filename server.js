/**
 * THEY GOOD TV — Servidor de Streams
 * Renueva automáticamente los links de canales
 * Despliega en Render.com gratis
 */

const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================
   CACHÉ EN MEMORIA
========================= */
const cache = {};
const CACHE_MINUTOS = 50;

function getCached(key) {
  const item = cache[key];
  if (!item) return null;
  const mins = (Date.now() - item.timestamp) / 60000;
  if (mins > CACHE_MINUTOS) return null;
  return item.data;
}
function setCache(key, data) {
  cache[key] = { data, timestamp: Date.now() };
}

/* =========================
   HEADERS COMUNES
========================= */
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,*/*",
  "Accept-Language": "es-ES,es;q=0.9",
};

/* =========================
   MAPA DE CANALES
   Agrega aquí cualquier canal nuevo
========================= */
const CANALES = {
  // ECUADOR
  "tc":            { url: "https://tctelevision.com/envivo/",         nombre: "TC Televisión" },
  "ecuavisa":      { url: "https://ecuavisa.com/en-vivo",             nombre: "Ecuavisa" },
  "teleamazonas":  { url: "https://teleamazonas.com/tv-en-vivo",      nombre: "Teleamazonas" },
  "rts":           { url: "https://rts.com.ec/envivo",                nombre: "RTS Ecuador" },
  "canal-uno":     { url: "https://canaluno.com.ec/en-vivo",          nombre: "Canal Uno" },
  "gama-tv":       { url: "https://gamatv.com.ec/en-vivo",            nombre: "Gama TV" },
  "tvc":           { url: "https://tvc.com.ec/en-vivo",               nombre: "TVC Ecuador" },

  // INTERNACIONALES
  "cnn-espanol":   { url: "https://cnnespanol.cnn.com/video/en-vivo", nombre: "CNN Español" },
  "record":        { url: "https://record.pt/en-direto",              nombre: "Record TV" },
  "antena3":       { url: "https://www.antena3.com/directos/antena3", nombre: "Antena 3" },
};

/* =========================
   EXTRACTOR UNIVERSAL
   Detecta: Dailymotion, YouTube, m3u8, iframe
========================= */
async function extraerEmbed(url) {
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      timeout: 12000,
      redirect: "follow"
    });
    const html = await res.text();

    // ── 1. DAILYMOTION ──────────────────────────────
    const dmPatterns = [
      /dailymotion\.com\/(?:embed\/video\/|player\.html\?video=)([a-zA-Z0-9]+)/,
      /dailymotion\.com\/video\/([a-zA-Z0-9]+)/,
      /geo\.dailymotion\.com\/player\.html\?video=([a-zA-Z0-9]+)/,
      /"video[Ii][dD]"\s*:\s*"([a-zA-Z0-9]+)"/,
      /video=([a-zA-Z0-9]{6,12})/,
    ];
    for (const p of dmPatterns) {
      const m = html.match(p);
      if (m && m[1] && m[1].length >= 5) {
        return {
          tipo: "iframe",
          embed: `https://www.dailymotion.com/embed/video/${m[1]}`,
          raw: m[1],
          fuente: "dailymotion"
        };
      }
    }

    // ── 2. YOUTUBE ──────────────────────────────────
    const ytPatterns = [
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/,
    ];
    for (const p of ytPatterns) {
      const m = html.match(p);
      if (m && m[1]) {
        return {
          tipo: "iframe",
          embed: `https://www.youtube.com/embed/${m[1]}?autoplay=1`,
          raw: m[1],
          fuente: "youtube"
        };
      }
    }

    // ── 3. M3U8 DIRECTO ─────────────────────────────
    const m3u8Pattern = /(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/;
    const m3u8Match = html.match(m3u8Pattern);
    if (m3u8Match) {
      return {
        tipo: "m3u8",
        embed: m3u8Match[1],
        raw: m3u8Match[1],
        fuente: "m3u8"
      };
    }

    // ── 4. IFRAME GENÉRICO ───────────────────────────
    const iframePattern = /<iframe[^>]+src=["']([^"']+)["'][^>]*>/i;
    const iframeMatch = html.match(iframePattern);
    if (iframeMatch && iframeMatch[1] &&
        !iframeMatch[1].includes("ads") &&
        !iframeMatch[1].includes("google") &&
        !iframeMatch[1].includes("facebook")) {
      return {
        tipo: "iframe",
        embed: iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1],
        raw: iframeMatch[1],
        fuente: "iframe"
      };
    }

    return null;
  } catch(e) {
    console.error("Error extrayendo:", e.message);
    return null;
  }
}

/* =========================
   ENDPOINT PRINCIPAL
   GET /live/:canal
   Ej: /live/tc  /live/ecuavisa
========================= */
app.get("/live/:canal", async (req, res) => {
  const key = req.params.canal.toLowerCase();

  // Buscar en el mapa
  const canalInfo = CANALES[key];
  if (!canalInfo) {
    return res.status(404).json({
      error: `Canal "${key}" no encontrado`,
      disponibles: Object.keys(CANALES)
    });
  }

  // Revisar caché
  const cached = getCached("live_" + key);
  if (cached) {
    // Redirigir directo al embed si es GET simple
    if (req.query.redirect === "1" || req.headers.accept?.includes("text/html")) {
      return res.redirect(cached.embed);
    }
    return res.json({ ...cached, fromCache: true });
  }

  // Extraer embed fresco
  console.log(`[live] Extrayendo ${canalInfo.nombre} desde ${canalInfo.url}`);
  const resultado = await extraerEmbed(canalInfo.url);

  if (!resultado) {
    return res.status(503).json({
      error: "No se pudo extraer el stream",
      canal: canalInfo.nombre,
      url: canalInfo.url
    });
  }

  const data = {
    canal: key,
    nombre: canalInfo.nombre,
    ...resultado,
    timestamp: new Date().toISOString()
  };

  setCache("live_" + key, data);

  // Si es una petición de iframe (redirect), redirigir directo
  if (req.query.redirect === "1") {
    return res.redirect(data.embed);
  }

  res.json({ ...data, fromCache: false });
});

/* =========================
   ENDPOINT: /live/:canal/player
   Devuelve un mini-player HTML listo
   para usar como iframe src en tu web
========================= */
app.get("/live/:canal/player", async (req, res) => {
  const key = req.params.canal.toLowerCase();
  const canalInfo = CANALES[key];
  if (!canalInfo) return res.status(404).send("Canal no encontrado");

  const cached = getCached("live_" + key);
  let data = cached;

  if (!data) {
    const resultado = await extraerEmbed(canalInfo.url);
    if (!resultado) return res.status(503).send("Stream no disponible");
    data = { canal: key, nombre: canalInfo.nombre, ...resultado, timestamp: new Date().toISOString() };
    setCache("live_" + key, data);
  }

  // Devolver HTML con el player embebido
  if (data.tipo === "iframe") {
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#000; overflow:hidden; }
iframe { width:100vw; height:100vh; border:none; }
</style>
</head>
<body>
<iframe src="${data.embed}" allowfullscreen allow="autoplay; encrypted-media; fullscreen"
  sandbox="allow-scripts allow-same-origin allow-forms allow-presentation"
  referrerpolicy="no-referrer"></iframe>
</body>
</html>`);
  } else if (data.tipo === "m3u8") {
    res.send(`<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>* { margin:0; padding:0; } body { background:#000; } video { width:100vw; height:100vh; }</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head>
<body>
<video id="v" autoplay controls playsinline></video>
<script>
const url = "${data.embed}";
const v = document.getElementById("v");
if (Hls.isSupported()) {
  const hls = new Hls();
  hls.loadSource(url);
  hls.attachMedia(v);
} else if (v.canPlayType("application/vnd.apple.mpegurl")) {
  v.src = url;
}
</script>
</body>
</html>`);
  }
});

/* =========================
   ENDPOINT: /canales
   Lista todos los canales disponibles
========================= */
app.get("/canales", (req, res) => {
  res.json({
    total: Object.keys(CANALES).length,
    canales: Object.entries(CANALES).map(([key, val]) => ({
      id: key,
      nombre: val.nombre,
      url_player: `/live/${key}/player`,
      url_info: `/live/${key}`
    }))
  });
});

/* =========================
   ENDPOINT: /live-add (POST)
   Agrega un canal temporal sin reiniciar
========================= */
app.post("/live-add", (req, res) => {
  const { id, url, nombre } = req.body;
  if (!id || !url || !nombre) {
    return res.status(400).json({ error: "Requiere: id, url, nombre" });
  }
  CANALES[id.toLowerCase()] = { url, nombre };
  res.json({ ok: true, mensaje: `Canal "${nombre}" agregado como /live/${id.toLowerCase()}` });
});

/* =========================
   ENDPOINTS ANTERIORES (mantener compatibilidad)
========================= */
async function verificarLink(url) {
  try {
    const r = await fetch(url, { method: "HEAD", headers: HEADERS, timeout: 6000 });
    return r.status === 200 || r.status === 206;
  } catch { return false; }
}

app.get("/streams", async (req, res) => {
  const cached = getCached("streams");
  if (cached) return res.json({ ...cached, fromCache: true });

  try {
    const ghRes = await fetch(
      "https://raw.githubusercontent.com/Thegood2006/MI-sitio-eventos/main/canales.json?nocache=" + Date.now()
    );
    const canales = await ghRes.json();

    const categorias = ["futbol", "ciclismo", "ufc", "ecuador", "internacional"];
    for (const cat of categorias) {
      if (!canales[cat]) continue;
      for (const evento of canales[cat]) {
        const estados = [];
        for (const url of (evento.reproductores || [])) {
          estados.push(!url || url.startsWith("TU_LINK") ? false : await verificarLink(url));
        }
        evento.estados = estados;
        evento.activo  = estados.some(e => e);
      }
    }

    canales.ultima_verificacion = new Date().toISOString();
    setCache("streams", canales);
    res.json({ ...canales, fromCache: false });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL requerida" });
  try {
    const response = await fetch(url, { headers: HEADERS, timeout: 10000 });
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    response.body.pipe(res);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    canales_disponibles: Object.keys(CANALES).length
  });
});

/* =========================
   PÁGINA PRINCIPAL
========================= */
app.get("/", (req, res) => {
  const canalesList = Object.entries(CANALES)
    .map(([k, v]) => `<a class="endpoint" href="/live/${k}/player" target="_blank">
      <span class="method get">GET</span>
      <span class="ep-path">/live/${k}/player</span>
      <span class="ep-desc">${v.nombre}</span>
    </a>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>THEY GOOD TV — API</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--cyan:#00e5ff;--purple:#7c3aed;--green:#00ff88;--red:#ff3d5a;--bg:#04040f;--bg2:#08081a;--bg3:#0d0d22;--border:rgba(0,229,255,0.15)}
body{background:var(--bg);color:#fff;font-family:'Share Tech Mono',monospace;min-height:100vh}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,229,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none}
.wrap{max-width:860px;margin:0 auto;padding:30px 20px 60px;position:relative;z-index:1}
header{text-align:center;padding:50px 20px 40px}
.logo-ring{display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:2px solid var(--cyan);box-shadow:0 0 30px rgba(0,229,255,0.3);margin-bottom:20px;font-size:2rem;animation:pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 20px rgba(0,229,255,0.3)}50%{box-shadow:0 0 50px rgba(0,229,255,0.6)}}
h1{font-family:'Orbitron',sans-serif;font-size:clamp(1.5rem,5vw,2.5rem);font-weight:900;background:linear-gradient(90deg,var(--cyan),#fff,var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;letter-spacing:0.08em;margin-bottom:8px}
.subtitle{color:rgba(255,255,255,.4);font-size:.75rem;letter-spacing:3px}
.status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.3);color:var(--green);border-radius:30px;padding:8px 20px;font-size:.75rem;letter-spacing:2px;margin-top:20px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:blink 1.5s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.section-title{font-family:'Orbitron',sans-serif;font-size:.75rem;color:var(--cyan);letter-spacing:3px;margin:28px 0 14px;display:flex;align-items:center;gap:10px}
.section-title::after{content:'';flex:1;height:1px;background:var(--border)}
.endpoint-list{display:flex;flex-direction:column;gap:8px;margin-bottom:24px}
.endpoint{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 18px;display:flex;align-items:center;gap:14px;transition:.2s;cursor:pointer;text-decoration:none}
.endpoint:hover{border-color:rgba(0,229,255,.4);background:rgba(0,229,255,.03)}
.method{font-family:'Orbitron',sans-serif;font-size:.6rem;font-weight:700;padding:4px 10px;border-radius:6px;flex-shrink:0;letter-spacing:1px}
.method.get{background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.4);color:var(--cyan)}
.method.post{background:rgba(255,200,0,.15);border:1px solid rgba(255,200,0,.4);color:#ffc800}
.ep-path{font-family:'Share Tech Mono',monospace;font-size:.85rem;color:#fff;flex:1}
.ep-desc{font-size:.65rem;color:rgba(255,255,255,.4);text-align:right}
.info-box{background:var(--bg2);border:1px solid rgba(0,229,255,.2);border-radius:12px;padding:18px 20px;margin-bottom:24px;font-size:.78rem;line-height:1.8;color:rgba(255,255,255,.7)}
.info-box code{color:var(--cyan);background:rgba(0,229,255,.1);padding:2px 6px;border-radius:4px;font-size:.75rem}
.footer{text-align:center;padding:40px 0 20px;color:rgba(255,255,255,.2);font-size:.65rem;letter-spacing:2px}
</style>
</head>
<body>
<header>
  <div class="logo-ring">📡</div>
  <h1>THEY GOOD TV</h1>
  <p class="subtitle">Stream API Server · v2.0</p>
  <div class="status-badge"><span class="dot"></span> SERVIDOR ACTIVO · ${Object.keys(CANALES).length} CANALES</div>
</header>
<div class="wrap">

  <div class="section-title">CÓMO USAR EN TU PÁGINA</div>
  <div class="info-box">
    En tu <code>canales.json</code> pon el endpoint <code>/live/CANAL/player</code> como iframe:<br><br>
    <code>"reproductores": ["https://theygoodtv-server.onrender.com/live/tc/player"]</code><br>
    <code>"tipo": "iframe"</code><br><br>
    El servidor extrae automáticamente el stream actualizado. Sin anuncios, sin página completa. ✓
  </div>

  <div class="section-title">CANALES DISPONIBLES</div>
  <div class="endpoint-list">${canalesList}</div>

  <div class="section-title">OTROS ENDPOINTS</div>
  <div class="endpoint-list">
    <a class="endpoint" href="/canales" target="_blank"><span class="method get">GET</span><span class="ep-path">/canales</span><span class="ep-desc">Lista todos los canales</span></a>
    <a class="endpoint" href="/streams" target="_blank"><span class="method get">GET</span><span class="ep-path">/streams</span><span class="ep-desc">Canales con estado</span></a>
    <a class="endpoint" href="/health" target="_blank"><span class="method get">GET</span><span class="ep-path">/health</span><span class="ep-desc">Estado del servidor</span></a>
    <div class="endpoint"><span class="method post">POST</span><span class="ep-path">/live-add</span><span class="ep-desc">Agregar canal temporal</span></div>
  </div>

  <div class="footer">THEY GOOD TV API &nbsp;·&nbsp; theygoodtv-server.onrender.com &nbsp;·&nbsp; v2.0.0</div>
</div>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`THEY GOOD TV Server v2.0 corriendo en puerto ${PORT}`);
  console.log(`Canales disponibles: ${Object.keys(CANALES).join(", ")}`);
});
