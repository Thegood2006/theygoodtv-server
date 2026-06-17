/**
 * THEY GOOD TV — Servidor v5.0
 * Sin Puppeteer — fetch puro + extracción de Dailymotion/YouTube/m3u8
 * Compatible con Node.js 18+ y Render.com free
 */

const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* ── CACHÉ 50 minutos ── */
const cache = {};
function getCached(k) {
  const i = cache[k];
  if (!i) return null;
  if ((Date.now() - i.t) / 60000 > 50) return null;
  return i.d;
}
function setCache(k, d) { cache[k] = { d, t: Date.now() }; }

/* ── MAPA DE CANALES ── */
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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/* ── EXTRACTOR ── */
async function extraerStream(url) {
  try {
    const res  = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Accept-Language": "es-ES,es;q=0.9" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow"
    });
    const html = await res.text();

    // 1. geo.dailymotion.com directo (como TC)
    const geoDM = html.match(/geo\.dailymotion\.com\/player\.html\?video=([a-zA-Z0-9]+)/);
    if (geoDM) {
      return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${geoDM[1]}&autoplay=1`, fuente: "dailymotion-geo" };
    }

    // 2. Dailymotion video ID genérico
    const dm = html.match(/dailymotion\.com\/(?:embed\/video\/|video\/)([a-zA-Z0-9]{5,12})/);
    if (dm) {
      return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${dm[1]}&autoplay=1`, fuente: "dailymotion" };
    }

    // 3. YouTube embed
    const yt = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (yt) {
      return { tipo: "iframe", embed: `https://www.youtube.com/embed/${yt[1]}?autoplay=1`, fuente: "youtube" };
    }

    // 4. YouTube videoId en JSON
    const ytJson = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    if (ytJson) {
      return { tipo: "iframe", embed: `https://www.youtube.com/embed/${ytJson[1]}?autoplay=1`, fuente: "youtube-json" };
    }

    // 5. m3u8 directo en el HTML
    const m3u8 = html.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/);
    if (m3u8) {
      return { tipo: "m3u8", embed: m3u8[1], fuente: "m3u8" };
    }

    // 6. iframe genérico con player/embed/live
    const iframe = html.match(/<iframe[^>]+src=["']([^"']+(?:embed|player|live)[^"']*)["']/i);
    if (iframe && iframe[1]) {
      const src = iframe[1].startsWith("//") ? "https:" + iframe[1] : iframe[1];
      return { tipo: "iframe", embed: src, fuente: "iframe" };
    }

    return null;
  } catch(e) {
    console.error("[extractor] Error:", e.message);
    return null;
  }
}

/* ── PLAYER HTML ── */
function htmlM3U8(data) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden}video{width:100vw;height:100vh;display:block}</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
</head><body>
<video id="v" autoplay controls playsinline></video>
<script>
const url="${data.embed}",v=document.getElementById("v");
if(Hls.isSupported()){const h=new Hls({lowLatencyMode:true});h.loadSource(url);h.attachMedia(v);h.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));}
else if(v.canPlayType("application/vnd.apple.mpegurl")){v.src=url;v.play().catch(()=>{});}
</script></body></html>`;
}

function htmlIframe(data) {
  const esDM = data.embed.includes("dailymotion");
  const attrs = esDM
    ? `allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen`
    : `allow="autoplay; fullscreen; encrypted-media" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"`;
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none}</style>
</head><body>
<iframe src="${data.embed}" ${attrs}></iframe>
</body></html>`;
}

function htmlError(nombre, urlOriginal) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0}body{background:#000;color:#fff;font-family:monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;gap:16px}
h2{color:#ff3d5a}p{color:rgba(255,255,255,.5);font-size:.8rem;max-width:300px;line-height:1.6}
a{color:#00e1ff;padding:10px 20px;border:1px solid #00e1ff;border-radius:8px;text-decoration:none}</style>
</head><body>
<div style="font-size:3rem">📡</div>
<h2>Stream no disponible</h2>
<p>${nombre} no pudo ser extraído. El canal puede estar offline.</p>
<a href="${urlOriginal}" target="_blank">Ver en sitio oficial →</a>
</body></html>`;
}

/* ── RUTAS ── */
app.get("/live/:canal/player", async (req, res) => {
  const key  = req.params.canal.toLowerCase();
  const info = CANALES[key];
  if (!info) return res.status(404).send("Canal no encontrado");

  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

  let data = getCached("live_" + key);
  if (!data) {
    console.log(`[player] Extrayendo: ${info.nombre}`);
    const r = await extraerStream(info.url);
    if (!r) return res.send(htmlError(info.nombre, info.url));
    data = { nombre: info.nombre, ...r };
    setCache("live_" + key, data);
  }

  console.log(`[player] ${info.nombre} → ${data.tipo} (${data.fuente})`);
  if (data.tipo === "m3u8")  return res.send(htmlM3U8(data));
  if (data.tipo === "iframe") return res.send(htmlIframe(data));
});

app.get("/live/:canal", async (req, res) => {
  const key  = req.params.canal.toLowerCase();
  const info = CANALES[key];
  if (!info) return res.status(404).json({ error: `Canal "${key}" no encontrado`, disponibles: Object.keys(CANALES) });

  const cached = getCached("live_" + key);
  if (cached) return res.json({ canal: key, nombre: info.nombre, ...cached, fromCache: true });

  const r = await extraerStream(info.url);
  if (!r) return res.status(503).json({ error: "Stream no disponible", canal: info.nombre });
  const data = { canal: key, nombre: info.nombre, ...r, timestamp: new Date().toISOString() };
  setCache("live_" + key, data);
  res.json({ ...data, fromCache: false });
});

app.get("/canales", (req, res) => {
  res.json({
    total: Object.keys(CANALES).length,
    canales: Object.entries(CANALES).map(([id, v]) => ({
      id, nombre: v.nombre,
      player: `/live/${id}/player`,
      info: `/live/${id}`
    }))
  });
});

app.post("/live-add", (req, res) => {
  const { id, url, nombre } = req.body;
  if (!id || !url || !nombre) return res.status(400).json({ error: "Requiere: id, url, nombre" });
  CANALES[id.toLowerCase()] = { url, nombre };
  res.json({ ok: true, mensaje: `Canal "${nombre}" agregado`, player: `/live/${id.toLowerCase()}/player` });
});

app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString(), canales: Object.keys(CANALES).length, version: "5.0" });
});

app.get("/", (req, res) => {
  const lista = Object.entries(CANALES)
    .map(([k,v]) => `<a class="ep" href="/live/${k}/player" target="_blank">
      <span class="badge">GET</span><span class="path">/live/${k}/player</span><span class="desc">${v.nombre}</span>
    </a>`).join("");
  res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>THEY GOOD TV API</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#04040f;color:#fff;font-family:'Share Tech Mono',monospace}
.wrap{max-width:800px;margin:0 auto;padding:40px 20px}
h1{font-family:'Orbitron',sans-serif;font-size:2rem;font-weight:900;text-align:center;
   background:linear-gradient(90deg,#00e5ff,#fff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
.sub{text-align:center;color:rgba(255,255,255,.3);font-size:.7rem;letter-spacing:3px;margin-bottom:30px}
.st{font-family:'Orbitron',sans-serif;font-size:.65rem;color:#00e5ff;letter-spacing:3px;margin:20px 0 10px;display:flex;align-items:center;gap:10px}
.st::after{content:'';flex:1;height:1px;background:rgba(0,229,255,.15)}
.ep{display:flex;align-items:center;gap:12px;background:#0d0d22;border:1px solid rgba(0,229,255,.15);border-radius:10px;padding:12px 16px;margin-bottom:8px;text-decoration:none;transition:.2s}
.ep:hover{border-color:rgba(0,229,255,.5);background:rgba(0,229,255,.05)}
.badge{font-family:'Orbitron',sans-serif;font-size:.55rem;font-weight:700;background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.4);color:#00e5ff;padding:4px 10px;border-radius:6px;flex-shrink:0}
.path{flex:1;font-size:.8rem}.desc{font-size:.6rem;color:rgba(255,255,255,.4)}
.info{background:#08081a;border:1px solid rgba(0,229,255,.2);border-radius:10px;padding:16px;margin-bottom:20px;font-size:.75rem;line-height:1.9;color:rgba(255,255,255,.6)}
code{color:#00e5ff;background:rgba(0,229,255,.1);padding:2px 6px;border-radius:4px}
</style></head><body><div class="wrap">
<h1>THEY GOOD TV</h1>
<p class="sub">Stream API · v5.0 · Sin Puppeteer</p>
<div class="st">CÓMO USAR</div>
<div class="info">En <code>canales.json</code>:<br><br>
<code>"reproductores": ["https://theygoodtv-server.onrender.com/live/tc/player"]</code><br>
<code>"tipo": "iframe"</code></div>
<div class="st">CANALES (${Object.keys(CANALES).length})</div>
${lista}
<div class="st">OTROS</div>
<a class="ep" href="/canales" target="_blank"><span class="badge">GET</span><span class="path">/canales</span><span class="desc">Lista JSON</span></a>
<a class="ep" href="/health" target="_blank"><span class="badge">GET</span><span class="path">/health</span><span class="desc">Estado</span></a>
</div></body></html>`);
});

app.listen(PORT, () => {
  console.log(`\n✅ THEY GOOD TV Server v5.0 — Puerto ${PORT}`);
  console.log(`📡 Canales: ${Object.keys(CANALES).join(", ")}\n`);
});
