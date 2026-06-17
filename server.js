/**
 * THEY GOOD TV — Servidor de Streams v3.0
 * Usa Puppeteer para extraer streams de páginas con JS dinámico
 * Despliega en Render.com (plan free con buildCommand)
 */

const express    = require("express");
const cors       = require("cors");
const puppeteer  = require("puppeteer");

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
   MAPA DE CANALES
========================= */
let CANALES = {
  // ECUADOR
  "tc":           { url: "https://tctelevision.com/envivo/",          nombre: "TC Televisión" },
  "ecuavisa":     { url: "https://ecuavisa.com/en-vivo",              nombre: "Ecuavisa" },
  "teleamazonas": { url: "https://teleamazonas.com/tv-en-vivo",       nombre: "Teleamazonas" },
  "rts":          { url: "https://rts.com.ec/envivo",                 nombre: "RTS Ecuador" },
  "canal-uno":    { url: "https://canaluno.com.ec/en-vivo",           nombre: "Canal Uno" },
  "gama-tv":      { url: "https://gamatv.com.ec/en-vivo",             nombre: "Gama TV" },
  "tvc":          { url: "https://tvc.com.ec/en-vivo",                nombre: "TVC Ecuador" },

  // INTERNACIONALES
  "cnn-espanol":  { url: "https://cnnespanol.cnn.com/video/en-vivo",  nombre: "CNN Español" },
  "record":       { url: "https://record.pt/en-direto",               nombre: "Record TV" },
  "antena3":      { url: "https://www.antena3.com/directos/antena3",  nombre: "Antena 3" },
};

/* =========================
   PUPPETEER — EXTRACTOR
   Abre la página real con JS,
   intercepta requests y encuentra el stream
========================= */
async function extraerConPuppeteer(url) {
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
        "--single-process",           // necesario en Render free
        "--disable-extensions",
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    });

    const page = await browser.newPage();

    // User-agent de Chrome real
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Bloquear recursos innecesarios (acelera la carga)
    await page.setRequestInterception(true);
    const streamsEncontrados = [];

    page.on("request", (req) => {
      const tipo = req.resourceType();
      const reqUrl = req.url();

      // Capturar URLs de stream mientras se interceptan
      if (
        reqUrl.includes(".m3u8") ||
        reqUrl.includes(".mpd") ||
        reqUrl.includes("manifest") ||
        reqUrl.includes("playlist")
      ) {
        streamsEncontrados.push({ tipo: "m3u8", url: reqUrl });
      }

      // Bloquear fuentes, imágenes y CSS (no son necesarios)
      if (["font", "image", "stylesheet"].includes(tipo)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Escuchar respuestas para capturar m3u8 en headers
    page.on("response", async (res) => {
      const resUrl = res.url();
      const ct = res.headers()["content-type"] || "";
      if (
        resUrl.includes(".m3u8") ||
        ct.includes("mpegurl") ||
        ct.includes("x-mpegURL")
      ) {
        streamsEncontrados.push({ tipo: "m3u8", url: resUrl });
      }
    });

    console.log(`[puppeteer] Abriendo: ${url}`);
    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 30000,
    });

    // Esperar un poco más para que cargue el player
    await new Promise(r => setTimeout(r, 4000));

    // ── 1. Si ya capturamos un m3u8, usarlo ──
    if (streamsEncontrados.length > 0) {
      const stream = streamsEncontrados[0];
      await browser.close();
      return {
        tipo: "m3u8",
        embed: stream.url,
        raw: stream.url,
        fuente: "m3u8-interceptado"
      };
    }

    // ── 2. Buscar iframes de Dailymotion / YouTube en el DOM ──
    const iframeInfo = await page.evaluate(() => {
      const iframes = [...document.querySelectorAll("iframe")];
      for (const f of iframes) {
        const src = f.src || f.getAttribute("data-src") || "";
        if (!src) continue;
        if (src.includes("dailymotion") || src.includes("geo.dailymotion")) {
          return { tipo: "iframe", embed: src, fuente: "dailymotion" };
        }
        if (src.includes("youtube.com/embed")) {
          return { tipo: "iframe", embed: src, fuente: "youtube" };
        }
        if (src.includes("youtube.com/watch") || src.includes("youtu.be")) {
          const vid = src.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (vid) return { tipo: "iframe", embed: `https://www.youtube.com/embed/${vid[1]}?autoplay=1`, fuente: "youtube" };
        }
        // Cualquier iframe que parezca un player
        if (src.includes("embed") || src.includes("player") || src.includes("live")) {
          return { tipo: "iframe", embed: src.startsWith("//") ? "https:" + src : src, fuente: "iframe" };
        }
      }

      // Buscar en el HTML completo
      const html = document.documentElement.innerHTML;

      // Dailymotion video ID
      const dm = html.match(/(?:dailymotion\.com\/(?:embed\/video\/|video\/)|video=)([a-zA-Z0-9]{5,12})/);
      if (dm && dm[1]) {
        return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${dm[1]}&autoplay=1`, fuente: "dailymotion" };
      }

      // YouTube video ID
      const yt = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
      if (yt && yt[1]) {
        return { tipo: "iframe", embed: `https://www.youtube.com/embed/${yt[1]}?autoplay=1`, fuente: "youtube" };
      }

      return null;
    });

    await browser.close();

    if (iframeInfo) return iframeInfo;

    return null;

  } catch (e) {
    console.error("[puppeteer] Error:", e.message);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

/* =========================
   GET /live/:canal
========================= */
app.get("/live/:canal", async (req, res) => {
  const key = req.params.canal.toLowerCase();
  const canalInfo = CANALES[key];
  if (!canalInfo) {
    return res.status(404).json({
      error: `Canal "${key}" no encontrado`,
      disponibles: Object.keys(CANALES)
    });
  }

  const cached = getCached("live_" + key);
  if (cached) {
    if (req.query.redirect === "1") return res.redirect(cached.embed);
    return res.json({ ...cached, fromCache: true });
  }

  console.log(`[live] Extrayendo: ${canalInfo.nombre}`);
  const resultado = await extraerConPuppeteer(canalInfo.url);

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

  if (req.query.redirect === "1") return res.redirect(data.embed);
  res.json({ ...data, fromCache: false });
});

/* =========================
   GET /live/:canal/player
   Mini-player HTML listo para iframe
========================= */
app.get("/live/:canal/player", async (req, res) => {
  const key = req.params.canal.toLowerCase();
  const canalInfo = CANALES[key];
  if (!canalInfo) return res.status(404).send("Canal no encontrado");

  let data = getCached("live_" + key);

  if (!data) {
    const resultado = await extraerConPuppeteer(canalInfo.url);
    if (!resultado) {
      return res.status(503).send(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>body{background:#000;color:#ff3d5a;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;font-size:1rem;}</style>
</head><body>⚠ Stream no disponible para<br><strong>${canalInfo.nombre}</strong><br><small>Intenta de nuevo en unos segundos</small></body></html>`);
    }
    data = {
      canal: key,
      nombre: canalInfo.nombre,
      ...resultado,
      timestamp: new Date().toISOString()
    };
    setCache("live_" + key, data);
  }

  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

  if (data.tipo === "iframe") {
    const esDM = data.fuente === "dailymotion" || (data.embed && data.embed.includes("dailymotion"));
    const attrs = esDM
      ? `allowfullscreen allow="autoplay; encrypted-media; fullscreen; picture-in-picture"`
      : `allowfullscreen allow="autoplay; encrypted-media; fullscreen" sandbox="allow-scripts allow-same-origin allow-forms allow-presentation" referrerpolicy="no-referrer"`;

    return res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none}</style>
</head><body>
<iframe src="${data.embed}" ${attrs}></iframe>
</body></html>`);
  }

  if (data.tipo === "m3u8") {
    return res.send(`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0}body{background:#000}video{width:100vw;height:100vh}</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head><body>
<video id="v" autoplay controls playsinline></video>
<script>
const url="${data.embed}";
const v=document.getElementById("v");
if(Hls.isSupported()){const h=new Hls();h.loadSource(url);h.attachMedia(v);}
else if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=url;}
</script></body></html>`);
  }
});

/* =========================
   GET /canales
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
   POST /live-add
   Agregar canal sin reiniciar
========================= */
app.post("/live-add", (req, res) => {
  const { id, url, nombre } = req.body;
  if (!id || !url || !nombre) {
    return res.status(400).json({ error: "Requiere: id, url, nombre" });
  }
  CANALES[id.toLowerCase()] = { url, nombre };
  res.json({
    ok: true,
    mensaje: `Canal "${nombre}" agregado como /live/${id.toLowerCase()}/player`
  });
});

/* =========================
   GET /health
========================= */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    canales_disponibles: Object.keys(CANALES).length,
    version: "3.0-puppeteer"
  });
});

/* =========================
   GET / — Página principal
========================= */
app.get("/", (req, res) => {
  const lista = Object.entries(CANALES)
    .map(([k, v]) => `<a class="endpoint" href="/live/${k}/player" target="_blank">
      <span class="method">GET</span>
      <span class="ep-path">/live/${k}/player</span>
      <span class="ep-desc">${v.nombre}</span>
    </a>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>THEY GOOD TV — API v3</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#04040f;color:#fff;font-family:'Share Tech Mono',monospace;min-height:100vh}
.wrap{max-width:860px;margin:0 auto;padding:30px 20px 60px}
header{text-align:center;padding:50px 20px 40px}
h1{font-family:'Orbitron',sans-serif;font-size:clamp(1.5rem,5vw,2.5rem);font-weight:900;
   background:linear-gradient(90deg,#00e5ff,#fff,#7c3aed);-webkit-background-clip:text;
   -webkit-text-fill-color:transparent;background-clip:text;margin-bottom:8px}
.subtitle{color:rgba(255,255,255,.4);font-size:.75rem;letter-spacing:3px}
.badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,.1);
  border:1px solid rgba(0,255,136,.3);color:#00ff88;border-radius:30px;
  padding:8px 20px;font-size:.75rem;letter-spacing:2px;margin-top:20px}
.dot{width:8px;height:8px;border-radius:50%;background:#00ff88;animation:blink 1.5s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.st{font-family:'Orbitron',sans-serif;font-size:.7rem;color:#00e5ff;letter-spacing:3px;
    margin:24px 0 12px;display:flex;align-items:center;gap:10px}
.st::after{content:'';flex:1;height:1px;background:rgba(0,229,255,.15)}
.endpoint{background:#0d0d22;border:1px solid rgba(0,229,255,.15);border-radius:10px;
  padding:12px 16px;display:flex;align-items:center;gap:14px;
  text-decoration:none;margin-bottom:8px;transition:.2s}
.endpoint:hover{border-color:rgba(0,229,255,.4);background:rgba(0,229,255,.04)}
.method{font-family:'Orbitron',sans-serif;font-size:.55rem;font-weight:700;
  padding:4px 10px;border-radius:6px;background:rgba(0,229,255,.15);
  border:1px solid rgba(0,229,255,.4);color:#00e5ff;flex-shrink:0}
.ep-path{font-size:.85rem;flex:1}
.ep-desc{font-size:.6rem;color:rgba(255,255,255,.4)}
.info{background:#08081a;border:1px solid rgba(0,229,255,.2);border-radius:10px;
  padding:16px;margin-bottom:20px;font-size:.75rem;line-height:1.9;color:rgba(255,255,255,.7)}
.info code{color:#00e5ff;background:rgba(0,229,255,.1);padding:2px 6px;border-radius:4px}
.footer{text-align:center;padding:40px 0 0;color:rgba(255,255,255,.2);font-size:.65rem;letter-spacing:2px}
</style></head><body>
<header>
  <h1>THEY GOOD TV</h1>
  <p class="subtitle">Stream API · v3.0 Puppeteer</p>
  <div class="badge"><span class="dot"></span> ONLINE · ${Object.keys(CANALES).length} CANALES</div>
</header>
<div class="wrap">
  <div class="st">CÓMO USAR</div>
  <div class="info">
    En <code>canales.json</code> pon como iframe:<br><br>
    <code>"reproductores": ["https://theygoodtv-server.onrender.com/live/tc/player"]</code><br>
    <code>"tipo": "iframe"</code><br><br>
    El servidor abre la página real con Puppeteer, extrae el stream y lo sirve limpio. ✓
  </div>
  <div class="st">CANALES DISPONIBLES</div>
  ${lista}
  <div class="st">OTROS ENDPOINTS</div>
  <a class="endpoint" href="/canales" target="_blank"><span class="method">GET</span><span class="ep-path">/canales</span><span class="ep-desc">Lista de canales</span></a>
  <a class="endpoint" href="/health" target="_blank"><span class="method">GET</span><span class="ep-path">/health</span><span class="ep-desc">Estado del servidor</span></a>
  <div class="endpoint"><span class="method">POST</span><span class="ep-path">/live-add</span><span class="ep-desc">Agregar canal sin reiniciar</span></div>
  <div class="footer">THEY GOOD TV API · v3.0 · Puppeteer Edition</div>
</div></body></html>`);
});

app.listen(PORT, () => {
  console.log(`THEY GOOD TV Server v3.0 (Puppeteer) en puerto ${PORT}`);
});
