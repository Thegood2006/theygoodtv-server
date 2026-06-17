/**
 * THEY GOOD TV — Servidor de Streams v4.0
 * Proxy real: abre la página oficial con Puppeteer y la sirve limpia
 * El usuario ve la página real de TC, Ecuavisa, etc. sin ads de la web
 */

const express   = require("express");
const cors      = require("cors");
const puppeteer = require("puppeteer");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* =========================
   CACHÉ DE M3U8 / STREAMS
========================= */
const cache = {};
const CACHE_MINUTOS = 45;

function getCached(key) {
  const item = cache[key];
  if (!item) return null;
  if ((Date.now() - item.timestamp) / 60000 > CACHE_MINUTOS) return null;
  return item.data;
}
function setCache(key, data) {
  cache[key] = { data, timestamp: Date.now() };
}

/* =========================
   MAPA DE CANALES
========================= */
let CANALES = {
  "tc":           { url: "https://tctelevision.com/envivo/",         nombre: "TC Televisión" },
  "ecuavisa":     { url: "https://ecuavisa.com/en-vivo",             nombre: "Ecuavisa" },
  "teleamazonas": { url: "https://teleamazonas.com/tv-en-vivo",      nombre: "Teleamazonas" },
  "rts":          { url: "https://rts.com.ec/envivo",                nombre: "RTS Ecuador" },
  "canal-uno":    { url: "https://canaluno.com.ec/en-vivo",          nombre: "Canal Uno" },
  "gama-tv":      { url: "https://gamatv.com.ec/en-vivo",            nombre: "Gama TV" },
  "tvc":          { url: "https://tvc.com.ec/en-vivo",               nombre: "TVC Ecuador" },
  "cnn-espanol":  { url: "https://cnnespanol.cnn.com/video/en-vivo", nombre: "CNN Español" },
  "record":       { url: "https://record.pt/en-direto",              nombre: "Record TV" },
  "antena3":      { url: "https://www.antena3.com/directos/antena3", nombre: "Antena 3" },
};

/* =========================
   LANZAR PUPPETEER
========================= */
async function getBrowser() {
  // Rutas posibles de Chrome en Render.com y otros entornos
  const fs = require("fs");
  const posiblesPaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "/opt/render/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ].filter(Boolean);

  let executablePath = undefined;
  for (const p of posiblesPaths) {
    // Soporte para glob simple (asterisco)
    if (p.includes("*")) {
      const { execSync } = require("child_process");
      try {
        const result = execSync(`ls ${p} 2>/dev/null | head -1`).toString().trim();
        if (result) { executablePath = result; break; }
      } catch {}
    } else if (fs.existsSync(p)) {
      executablePath = p;
      break;
    }
  }

  console.log(`[browser] Chrome path: ${executablePath || "puppeteer default"}`);

  return puppeteer.launch({
    headless: "new",
    executablePath,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-extensions",
      "--disable-web-security",
      "--allow-running-insecure-content",
    ],
  });
}

/* =========================
   EXTRACTOR CON PUPPETEER
   Estrategia:
   1. Interceptar red → capturar .m3u8 directo (lo mejor)
   2. Si no hay m3u8 → buscar iframe embebido en el DOM
   3. Si es Dailymotion → usar geo.dailymotion.com (permite embed)
   4. Fallback → devolver la URL original para mostrarla directo
========================= */
async function extraerStream(url) {
  let browser;
  try {
    browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );

    // Interceptar peticiones de red
    await page.setRequestInterception(true);
    const m3u8Urls = [];

    page.on("request", req => {
      const u = req.url();
      const t = req.resourceType();
      // Capturar m3u8
      if (u.includes(".m3u8") || u.includes("manifest") || u.includes("index.m3u8")) {
        m3u8Urls.push(u);
      }
      // Abortar recursos pesados innecesarios
      if (["font", "image", "stylesheet", "media"].includes(t) && !u.includes(".m3u8")) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Capturar también desde respuestas
    page.on("response", async res => {
      const u = res.url();
      const ct = res.headers()["content-type"] || "";
      if (u.includes(".m3u8") || ct.includes("mpegurl") || ct.includes("x-mpegURL")) {
        if (!m3u8Urls.includes(u)) m3u8Urls.push(u);
      }
    });

    console.log(`[extractor] Abriendo: ${url}`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 35000 });
    await new Promise(r => setTimeout(r, 5000)); // esperar player

    // ── PRIORIDAD 1: m3u8 directo capturado ──
    if (m3u8Urls.length > 0) {
      const stream = m3u8Urls[0];
      console.log(`[extractor] ✓ m3u8 encontrado: ${stream}`);
      await browser.close();
      return { tipo: "m3u8", embed: stream, fuente: "m3u8-red" };
    }

    // ── PRIORIDAD 2: buscar en el DOM ──
    const domResult = await page.evaluate(() => {
      // Buscar iframes
      const iframes = [...document.querySelectorAll("iframe")];
      for (const f of iframes) {
        const src = f.src || f.getAttribute("data-src") || f.getAttribute("data-lazy-src") || "";
        if (!src || src === "about:blank") continue;

        // Dailymotion — convertir a geo.dailymotion.com que SÍ permite embed
        const dm = src.match(/dailymotion\.com\/(?:embed\/video\/|video\/)([a-zA-Z0-9]+)/);
        if (dm) return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${dm[1]}&autoplay=1`, fuente: "dailymotion-geo" };
        if (src.includes("geo.dailymotion.com")) return { tipo: "iframe", embed: src, fuente: "dailymotion-geo" };

        // YouTube
        const yt = src.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
        if (yt) return { tipo: "iframe", embed: `https://www.youtube.com/embed/${yt[1]}?autoplay=1`, fuente: "youtube" };

        // Cualquier embed/player
        if (src.includes("embed") || src.includes("player") || src.includes("live")) {
          return { tipo: "iframe", embed: src.startsWith("//") ? "https:" + src : src, fuente: "iframe-dom" };
        }
      }

      // Buscar en el HTML
      const html = document.documentElement.innerHTML;

      // m3u8 en el HTML
      const m = html.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/);
      if (m) return { tipo: "m3u8", embed: m[1], fuente: "m3u8-html" };

      // Dailymotion video ID en el HTML
      const dm = html.match(/(?:video=|\/video\/)([a-zA-Z0-9]{5,12})(?:[&"'\s])/);
      if (dm && dm[1] && dm[1].length >= 5) {
        return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${dm[1]}&autoplay=1`, fuente: "dailymotion-html" };
      }

      // YouTube videoId en el HTML
      const yt = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
      if (yt) return { tipo: "iframe", embed: `https://www.youtube.com/embed/${yt[1]}?autoplay=1`, fuente: "youtube-html" };

      return null;
    });

    await browser.close();

    if (domResult) {
      console.log(`[extractor] ✓ encontrado en DOM: ${domResult.fuente}`);
      return domResult;
    }

    console.log(`[extractor] ✗ no se encontró stream en ${url}`);
    return null;

  } catch (e) {
    console.error("[extractor] Error:", e.message);
    if (browser) await browser.close().catch(() => {});
    return null;
  }
}

/* =========================
   GET /live/:canal/player
   Mini-player HTML — este es el que usas como iframe en tu web
========================= */
app.get("/live/:canal/player", async (req, res) => {
  const key = req.params.canal.toLowerCase();
  const info = CANALES[key];
  if (!info) return res.status(404).send("Canal no encontrado");

  // Cabeceras para permitir embed en cualquier sitio
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");
  res.setHeader("Cache-Control", "no-cache");

  let data = getCached("live_" + key);

  if (!data) {
    const resultado = await extraerStream(info.url);
    if (!resultado) {
      // Fallback: mostrar la página oficial directamente dentro de un iframe
      // con nuestro proxy para evitar el X-Frame-Options de la página original
      return res.send(paginaError(info.nombre, info.url));
    }
    data = { canal: key, nombre: info.nombre, ...resultado, timestamp: new Date().toISOString() };
    setCache("live_" + key, data);
  }

  console.log(`[player] Sirviendo ${info.nombre} — tipo: ${data.tipo} — fuente: ${data.fuente}`);

  if (data.tipo === "m3u8") {
    return res.send(playerM3U8(data));
  }

  if (data.tipo === "iframe") {
    return res.send(playerIframe(data));
  }
});

/* =========================
   TEMPLATES HTML
========================= */
function playerM3U8(data) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden}video{width:100vw;height:100vh;display:block}</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head><body>
<video id="v" autoplay controls playsinline></video>
<script>
const url = "${data.embed}";
const v   = document.getElementById("v");
if (Hls.isSupported()) {
  const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
  hls.loadSource(url);
  hls.attachMedia(v);
  hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(()=>{}));
} else if (v.canPlayType("application/vnd.apple.mpegurl")) {
  v.src = url;
  v.play().catch(()=>{});
}
</script>
</body></html>`;
}

function playerIframe(data) {
  const esDM = data.fuente && data.fuente.includes("dailymotion");
  const attrs = esDM
    ? `allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen`
    : `allow="autoplay; fullscreen; encrypted-media" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"`;

  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none}</style>
</head><body>
<iframe src="${data.embed}" ${attrs}></iframe>
</body></html>`;
}

function paginaError(nombre, urlOriginal) {
  return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#000;color:#fff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;gap:16px}
.icon{font-size:3rem}
h2{color:#ff3d5a;font-size:1rem}
p{color:rgba(255,255,255,.5);font-size:.75rem;max-width:300px;line-height:1.6}
a{color:#00e1ff;font-size:.75rem;padding:10px 20px;border:1px solid #00e1ff;border-radius:8px;text-decoration:none}
a:hover{background:rgba(0,225,255,.1)}
</style></head><body>
<div class="icon">📡</div>
<h2>Stream no disponible</h2>
<p>No se pudo extraer el stream de <strong>${nombre}</strong>. El canal puede estar offline o cambió su método de reproducción.</p>
<a href="${urlOriginal}" target="_blank">Ver en sitio oficial →</a>
</body></html>`;
}

/* =========================
   GET /live/:canal — Info JSON
========================= */
app.get("/live/:canal", async (req, res) => {
  const key = req.params.canal.toLowerCase();
  const info = CANALES[key];
  if (!info) return res.status(404).json({ error: `Canal "${key}" no encontrado`, disponibles: Object.keys(CANALES) });

  const cached = getCached("live_" + key);
  if (cached) return res.json({ ...cached, fromCache: true });

  const resultado = await extraerStream(info.url);
  if (!resultado) return res.status(503).json({ error: "Stream no disponible", canal: info.nombre });

  const data = { canal: key, nombre: info.nombre, ...resultado, timestamp: new Date().toISOString() };
  setCache("live_" + key, data);
  res.json({ ...data, fromCache: false });
});

/* =========================
   GET /canales
========================= */
app.get("/canales", (req, res) => {
  res.json({
    total: Object.keys(CANALES).length,
    canales: Object.entries(CANALES).map(([id, v]) => ({
      id, nombre: v.nombre,
      player: `/live/${id}/player`,
      info:   `/live/${id}`
    }))
  });
});

/* =========================
   POST /live-add — Agregar canal sin reiniciar
========================= */
app.post("/live-add", (req, res) => {
  const { id, url, nombre } = req.body;
  if (!id || !url || !nombre) return res.status(400).json({ error: "Requiere: id, url, nombre" });
  CANALES[id.toLowerCase()] = { url, nombre };
  console.log(`[live-add] Canal agregado: ${id} → ${url}`);
  res.json({ ok: true, mensaje: `Canal "${nombre}" agregado`, player: `/live/${id.toLowerCase()}/player` });
});

/* =========================
   GET /health
========================= */
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), canales: Object.keys(CANALES).length, version: "4.0" });
});

/* =========================
   GET / — Página principal
========================= */
app.get("/", (req, res) => {
  const lista = Object.entries(CANALES)
    .map(([k, v]) => `<a class="ep" href="/live/${k}/player" target="_blank">
      <span class="badge">GET</span>
      <span class="path">/live/${k}/player</span>
      <span class="desc">${v.nombre}</span>
    </a>`).join("");

  res.send(`<!DOCTYPE html>
<html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>THEY GOOD TV — API v4</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#04040f;color:#fff;font-family:'Share Tech Mono',monospace;min-height:100vh}
.wrap{max-width:800px;margin:0 auto;padding:40px 20px}
h1{font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;
   background:linear-gradient(90deg,#00e5ff,#fff,#7c3aed);
   -webkit-background-clip:text;-webkit-text-fill-color:transparent;
   background-clip:text;text-align:center;margin-bottom:6px}
.sub{text-align:center;color:rgba(255,255,255,.3);font-size:.7rem;letter-spacing:3px;margin-bottom:30px}
.st{font-family:'Orbitron',sans-serif;font-size:.65rem;color:#00e5ff;
    letter-spacing:3px;margin:20px 0 10px;display:flex;align-items:center;gap:10px}
.st::after{content:'';flex:1;height:1px;background:rgba(0,229,255,.15)}
.ep{display:flex;align-items:center;gap:12px;background:#0d0d22;
    border:1px solid rgba(0,229,255,.15);border-radius:10px;
    padding:12px 16px;margin-bottom:8px;text-decoration:none;transition:.2s}
.ep:hover{border-color:rgba(0,229,255,.5);background:rgba(0,229,255,.05)}
.badge{font-family:'Orbitron',sans-serif;font-size:.55rem;font-weight:700;
  background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.4);
  color:#00e5ff;padding:4px 10px;border-radius:6px;flex-shrink:0}
.path{flex:1;font-size:.8rem}
.desc{font-size:.6rem;color:rgba(255,255,255,.4)}
.info{background:#08081a;border:1px solid rgba(0,229,255,.2);border-radius:10px;
  padding:16px;margin-bottom:20px;font-size:.75rem;line-height:1.9;color:rgba(255,255,255,.6)}
code{color:#00e5ff;background:rgba(0,229,255,.1);padding:2px 6px;border-radius:4px}
</style></head><body>
<div class="wrap">
  <h1>THEY GOOD TV</h1>
  <p class="sub">Stream API · v4.0 · Puppeteer Proxy</p>
  <div class="st">CÓMO USAR</div>
  <div class="info">
    En <code>canales.json</code> agrega como iframe:<br><br>
    <code>"reproductores": ["https://theygoodtv-server.onrender.com/live/tc/player"]</code><br>
    <code>"tipo": "iframe"</code><br><br>
    El servidor abre la página oficial con Puppeteer, extrae el stream real y lo sirve sin la página completa.
  </div>
  <div class="st">CANALES (${Object.keys(CANALES).length})</div>
  ${lista}
  <div class="st">OTROS</div>
  <a class="ep" href="/canales" target="_blank"><span class="badge">GET</span><span class="path">/canales</span><span class="desc">Lista JSON</span></a>
  <a class="ep" href="/health" target="_blank"><span class="badge">GET</span><span class="path">/health</span><span class="desc">Estado</span></a>
</div></body></html>`);
});

app.listen(PORT, () => {
  console.log(`\n🎯 THEY GOOD TV Server v4.0 (Puppeteer Proxy) — Puerto ${PORT}`);
  console.log(`📡 Canales: ${Object.keys(CANALES).join(", ")}\n`);
});
