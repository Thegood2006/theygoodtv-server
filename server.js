/**
 * THEY GOOD TV Ã¢ÂÂ Servidor v6.0
 * Streams reales verificados Ã¢ÂÂ Sin Puppeteer
 * Compatible con Node.js 18+ y Render.com
 */

const express = require("express");
const cors    = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

/* Ã¢ÂÂÃ¢ÂÂ CACHÃÂ 50 minutos Ã¢ÂÂÃ¢ÂÂ */
const cache = {};
function getCached(k) {
  const i = cache[k];
  if (!i) return null;
  if ((Date.now() - i.t) / 60000 > 50) return null;
  return i.d;
}
function setCache(k, d) { cache[k] = { d, t: Date.now() }; }

/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
   MAPA DE CANALES CON STREAMS REALES VERIFICADOS
   embedFijo = link directo que funciona sin scraping
   url       = pÃÂ¡gina oficial (fallback / info)
   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */
let CANALES = {

  /* Ã¢ÂÂÃ¢ÂÂ ECUADOR Ã¢ÂÂÃ¢ÂÂ */
  "tc": {
    nombre: "TC TelevisiÃÂ³n",
    url: "https://tctelevision.com/envivo/",
    // TC usa Dailymotion Ã¢ÂÂ el extractor lo captura solo
  },
  "ecuavisa": {
    nombre: "Ecuavisa",
    url: "https://ecuavisa.com/en-vivo",
    embedFijo: {
      tipo: "m3u8",
      embed: "https://redirector.rudo.video/hls-video/c54ac2799874375c81c1672abb700870537c5223/ecuavisa/ecuavisa.smil/playlist.m3u8",
      fuente: "rudo-m3u8"
    }
  },
  "teleamazonas": {
    nombre: "Teleamazonas",
    url: "https://teleamazonas.com/tv-en-vivo",
    embedFijo: {
      tipo: "m3u8",
      embed: "https://teleamazonas-live.cdn.vustreams.com/live/b545dc57-91af-4f6b-bac7-8d9337166407/live.isml/live.m3u8",
      fuente: "vustreams-m3u8"
    }
  },
  "rts": {
    nombre: "RTS Ecuador",
    url: "https://rts.com.ec/envivo",
    embedFijo: {
      tipo: "m3u8",
      embed: "https://d2qsan2ut81n2k.cloudfront.net/live/72a3661e-1019-45f8-af10-af59f6ef6222/ts:abr.m3u8",
      fuente: "cloudfront-m3u8"
    }
  },
  "canal-uno": {
    nombre: "Canal Uno",
    url: "https://canaluno.com.ec/en-vivo",
    embedFijo: {
      tipo: "iframe",
      embed: "https://playerv.voxtvhd.com.br/video/sonorama/1/true/false/VmpGb2QxUXhWWGxWYTJoV1ltdGFXVll3V21GamJHeHpWVzVLVGxKdVFrZFpWV1JIWVZVeFdWRnJWbFZpUjFJeldWWlZlR05XUm5GU2JHaFhaV3hhVEZaVldrOU5SbXhTVUZRd1BRPT0rUg==/16:9/WkROa00weHVUbkJrU0ZsMVlrZHNNbHBSUFQwPSsz/nao",
      fuente: "voxtvhd"
    }
  },
  "gama-tv": {
    nombre: "GamavisiÃÂ³n",
    url: "https://gamatv.com.ec/en-vivo",
    embedFijo: {
      tipo: "m3u8",
      embed: "https://stream.esradioecuador.com/hls/stream.m3u8",
      fuente: "esradio-m3u8"
    }
  },
  "ecdf": {
    nombre: "El Canal del FÃÂºtbol",
    url: "https://ecdf.ec",
    embedFijo: {
      tipo: "iframe",
      embed: "https://tvtvhd.com/vivo/canales.php?stream=ecdf_ligapro",
      fuente: "tvtvhd"
    }
  },
  "ecuador-tv": {
    nombre: "Ecuador TV",
    url: "https://ecuadortv.ec/en-vivo",
    embedFijo: {
      tipo: "iframe",
      embed: "https://www.youtube.com/embed/live_stream?channel=UCqCmUEN9QPkLi-VMv2cFUZQ&autoplay=1",
      fuente: "youtube"
    }
  },

  /* Ã¢ÂÂÃ¢ÂÂ COLOMBIA Ã¢ÂÂÃ¢ÂÂ */
  "caracol": {
    nombre: "Noticias Caracol",
    url: "https://www.noticiascaracol.com/senal-en-vivo",
    embedFijo: {
      tipo: "iframe",
      embed: "https://www.youtube.com/embed/kMNm9L0TM1w?autoplay=1",
      fuente: "youtube-live"
    }
  },
  "rcn": {
    nombre: "Canal RCN",
    url: "https://www.canalrcn.com/envivo",
    embedFijo: {
      tipo: "iframe",
      embed: "https://www.youtube.com/embed/live_stream?channel=UCVy_XAXgMf7LJOdOy7BFMFA&autoplay=1",
      fuente: "youtube"
    }
  },

  /* Ã¢ÂÂÃ¢ÂÂ INTERNACIONALES Ã¢ÂÂÃ¢ÂÂ */
  "cnn-espanol": {
    nombre: "CNN en EspaÃÂ±ol",
    url: "https://cnnespanol.cnn.com/video/en-vivo",
    embedFijo: {
      tipo: "iframe",
      embed: "https://www.youtube.com/embed/live_stream?channel=UCrp_UI8XtuYfpiqX1V9bGEQ&autoplay=1",
      fuente: "youtube"
    }
  },
  "record": {
    nombre: "Record TV",
    url: "https://record.pt/en-direto",
    embedFijo: {
      tipo: "iframe",
      embed: "https://www.youtube.com/embed/live_stream?channel=UCBi4M4mMBqHRrUmymAf5X5A&autoplay=1",
      fuente: "youtube"
    }
  },
  "antena3": {
    nombre: "Antena 3",
    url: "https://www.antena3.com/directos/antena3",
    embedFijo: {
      tipo: "iframe",
      embed: "https://www.youtube.com/embed/live_stream?channel=UCMdPbFfGtxJcLsH2VLEQCUA&autoplay=1",
      fuente: "youtube"
    }
  },

  "tvc": {
    nombre: "tvcecu",
    url: "https://www.tvc.com.ec/envivo/",
    embedFijo: {
      tipo: "m3u8",
      embed: "https://d2b5h5wyivfnfl.cloudfront.net/live/19e86940-42cc-485e-80f4-89ae27c69f1b/medialist_4276517416086298479_hls.m3u8",
      fuente: "manual"
    }
  },
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/* Ã¢ÂÂÃ¢ÂÂ EXTRACTOR DE EMERGENCIA (para canales sin embedFijo) Ã¢ÂÂÃ¢ÂÂ */
async function extraerStream(url) {
  try {
    const res  = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,*/*",
        "Accept-Language": "es-ES,es;q=0.9",
        "Referer": "https://google.com"
      },
      signal: AbortSignal.timeout(15000),
      redirect: "follow"
    });
    const html = await res.text();

    // 1. Dailymotion geo directo (TC, etc.)
    const geoDM = html.match(/geo\.dailymotion\.com\/player\.html\?video=([a-zA-Z0-9]+)/);
    if (geoDM) return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${geoDM[1]}&autoplay=1`, fuente: "dailymotion-geo" };

    // 2. Dailymotion video ID genÃÂ©rico
    const dm = html.match(/dailymotion\.com\/(?:embed\/video\/|video\/)([a-zA-Z0-9]{5,12})/);
    if (dm) return { tipo: "iframe", embed: `https://geo.dailymotion.com/player.html?video=${dm[1]}&autoplay=1`, fuente: "dailymotion" };

    // 3. YouTube embed directo
    const yt = html.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/);
    if (yt) return { tipo: "iframe", embed: `https://www.youtube.com/embed/${yt[1]}?autoplay=1`, fuente: "youtube" };

    // 4. YouTube videoId en JSON
    const ytJson = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
    if (ytJson) return { tipo: "iframe", embed: `https://www.youtube.com/embed/${ytJson[1]}?autoplay=1`, fuente: "youtube-json" };

    // 5. m3u8 directo
    const m3u8 = html.match(/(https?:\/\/[^"'\s<>]+\.m3u8[^"'\s<>]*)/);
    if (m3u8) return { tipo: "m3u8", embed: m3u8[1], fuente: "m3u8" };

    // 6. JWPlayer file
    const jwp = html.match(/file["'\s]*:["'\s]*(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/);
    if (jwp) return { tipo: "m3u8", embed: jwp[1], fuente: "jwplayer" };

    // 7. data-src con m3u8
    const dataSrc = html.match(/data-(?:src|stream|url)=["'](https?:\/\/[^"']+\.m3u8[^"']*)/i);
    if (dataSrc) return { tipo: "m3u8", embed: dataSrc[1], fuente: "data-src" };

    // 8. iframe con player/embed/live
    const iframe = html.match(/<iframe[^>]+src=["']([^"']+(?:embed|player|live|stream)[^"']*)["']/i);
    if (iframe && iframe[1]) {
      const src = iframe[1].startsWith("//") ? "https:" + iframe[1] : iframe[1];
      return { tipo: "iframe", embed: src, fuente: "iframe" };
    }

    return null;
  } catch(e) {
    console.error("[extractor]", e.message);
    return null;
  }
}

/* Ã¢ÂÂÃ¢ÂÂ TEMPLATES HTML Ã¢ÂÂÃ¢ÂÂ */
function htmlM3U8(data) {
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#000;overflow:hidden}
#v{width:100vw;height:100vh;display:block}</style>
<script src="https://cdn.jsdelivr.net/npm/hls.js@latest"><\/script>
</head><body>
<video id="v" autoplay controls playsinline></video>
<script>
const url="${data.embed}", v=document.getElementById("v");
if(Hls.isSupported()){
  const h=new Hls({lowLatencyMode:true,maxBufferLength:30});
  h.loadSource(url); h.attachMedia(v);
  h.on(Hls.Events.MANIFEST_PARSED,()=>v.play().catch(()=>{}));
  h.on(Hls.Events.ERROR,(e,d)=>{if(d.fatal)h.recoverMediaError();});
} else if(v.canPlayType("application/vnd.apple.mpegurl")){
  v.src=url; v.play().catch(()=>{});
}
<\/script></body></html>`;
}

function htmlIframe(data) {
  const esDM = data.embed.includes("dailymotion");
  const attrs = esDM
    ? `allow="autoplay; fullscreen; encrypted-media; picture-in-picture" allowfullscreen`
    : `allow="autoplay; fullscreen; encrypted-media" allowfullscreen sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"`;
  return `<!DOCTYPE html><html><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.nombre}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#000;overflow:hidden}
iframe{position:fixed;top:0;left:0;width:100%;height:100%;border:none}</style>
</head><body>
<iframe src="${data.embed}" ${attrs}></iframe>
</body></html>`;
}

function htmlError(nombre, urlOriginal) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0}body{background:#000;color:#fff;font-family:monospace;
display:flex;flex-direction:column;align-items:center;justify-content:center;
height:100vh;text-align:center;gap:16px}h2{color:#ff3d5a}
p{color:rgba(255,255,255,.5);font-size:.8rem;max-width:320px;line-height:1.6}
a{color:#00e1ff;padding:10px 20px;border:1px solid #00e1ff;border-radius:8px;text-decoration:none}</style>
</head><body>
<div style="font-size:3rem">Ã°ÂÂÂ¡</div>
<h2>Stream no disponible</h2>
<p>${nombre} no pudo ser extraÃÂ­do en este momento. El canal puede estar offline o cambiÃÂ³ su reproductor.</p>
<a href="${urlOriginal}" target="_blank">Ver en sitio oficial Ã¢ÂÂ</a>
</body></html>`;
}

/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ
   RUTAS
   Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂÃ¢ÂÂ */

/* Player embebido */
app.get("/live/:canal/player", async (req, res) => {
  const key  = req.params.canal.toLowerCase();
  const info = CANALES[key];
  if (!info) return res.status(404).send(htmlError("Canal no encontrado", "/canales"));

  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.setHeader("Content-Security-Policy", "frame-ancestors *");

  // Si tiene embed fijo, ÃÂºsalo directo sin fetch
  if (info.embedFijo) {
    const data = { nombre: info.nombre, ...info.embedFijo };
    console.log(`[player] ${info.nombre} Ã¢ÂÂ ${data.tipo} (${data.fuente}) [FIJO]`);
    if (data.tipo === "m3u8")   return res.send(htmlM3U8(data));
    if (data.tipo === "iframe") return res.send(htmlIframe(data));
  }

  // Si no tiene embedFijo, intentar extracciÃÂ³n dinÃÂ¡mica con cachÃÂ©
  let data = getCached("live_" + key);
  if (!data) {
    console.log(`[player] Extrayendo dinÃÂ¡micamente: ${info.nombre}`);
    const r = await extraerStream(info.url);
    if (!r) return res.send(htmlError(info.nombre, info.url));
    data = { nombre: info.nombre, ...r };
    setCache("live_" + key, data);
  }

  console.log(`[player] ${info.nombre} Ã¢ÂÂ ${data.tipo} (${data.fuente})`);
  if (data.tipo === "m3u8")   return res.send(htmlM3U8(data));
  if (data.tipo === "iframe") return res.send(htmlIframe(data));
});

/* Info JSON del canal */
app.get("/live/:canal", async (req, res) => {
  const key  = req.params.canal.toLowerCase();
  const info = CANALES[key];
  if (!info) return res.status(404).json({ error: `Canal "${key}" no encontrado`, disponibles: Object.keys(CANALES) });

  if (info.embedFijo) {
    return res.json({ canal: key, nombre: info.nombre, ...info.embedFijo, fromCache: false });
  }

  const cached = getCached("live_" + key);
  if (cached) return res.json({ canal: key, nombre: info.nombre, ...cached, fromCache: true });

  const r = await extraerStream(info.url);
  if (!r) return res.status(503).json({ error: "Stream no disponible", canal: info.nombre });
  const data = { canal: key, nombre: info.nombre, ...r, timestamp: new Date().toISOString() };
  setCache("live_" + key, data);
  res.json({ ...data, fromCache: false });
});

/* Lista de canales */
app.get("/canales", (req, res) => {
  res.json({
    total: Object.keys(CANALES).length,
    canales: Object.entries(CANALES).map(([id, v]) => ({
      id,
      nombre: v.nombre,
      tieneStreamFijo: !!v.embedFijo,
      player: `/live/${id}/player`,
      info: `/live/${id}`
    }))
  });
});

/* Agregar canal desde el panel admin */
app.post("/live-add", (req, res) => {
  const { id, url, nombre, embed, tipo } = req.body;
  if (!id || !nombre) return res.status(400).json({ error: "Requiere: id, nombre" });

  const canalId = id.toLowerCase().replace(/\s+/g, "-");

  if (embed) {
    // Si mandan embed directo, ÃÂºsalo como embedFijo
    CANALES[canalId] = {
      nombre,
      url: url || embed,
      embedFijo: { tipo: tipo || "iframe", embed, fuente: "manual" }
    };
  } else {
    // Si solo mandan URL, intentar extracciÃÂ³n dinÃÂ¡mica
    CANALES[canalId] = { url: url || "", nombre };
  }

  res.json({
    ok: true,
    mensaje: `Canal "${nombre}" agregado`,
    player: `/live/${canalId}/player`,
    consejo: embed ? "Stream fijo guardado Ã¢ÂÂ" : "Se extraerÃÂ¡ dinÃÂ¡micamente al primer acceso"
  });
});

/* Health check */
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    time: new Date().toISOString(),
    canales: Object.keys(CANALES).length,
    version: "6.0",
    canalesConStreamFijo: Object.values(CANALES).filter(c => c.embedFijo).length
  });
});

/* PÃÂ¡gina principal (index visual) */
app.get("/", (req, res) => {
  const grupos = {
    "Ã°ÂÂÂªÃ°ÂÂÂ¨ Ecuador": ["tc","ecuavisa","teleamazonas","rts","canal-uno","gama-tv","ecdf","ecuador-tv"],
    "Ã°ÂÂÂ¨Ã°ÂÂÂ´ Colombia": ["caracol","rcn"],
    "Ã°ÂÂÂ Internacional": ["cnn-espanol","record","antena3"]
  };

  let secciones = "";
  for (const [grupo, ids] of Object.entries(grupos)) {
    const items = ids.map(k => {
      const v = CANALES[k];
      if (!v) return "";
      const badge = v.embedFijo ? `<span style="color:#00ff99;font-size:.6rem">Ã¢ÂÂ FIJO</span>` : `<span style="color:#ffc800;font-size:.6rem">Ã¢ÂÂ DIN</span>`;
      return `<a class="ep" href="/live/${k}/player" target="_blank">
        <span class="badge">GET</span>
        <span class="path">/live/${k}/player</span>
        <span class="desc">${v.nombre} &nbsp; ${badge}</span>
      </a>`;
    }).join("");
    secciones += `<div class="st">${grupo}</div>${items}`;
  }

  res.send(`<!DOCTYPE html><html lang="es"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>THEY GOOD TV Ã¢ÂÂ API v6</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#04040f;color:#fff;font-family:'Share Tech Mono',monospace}
.wrap{max-width:820px;margin:0 auto;padding:40px 20px}
h1{font-family:'Orbitron',sans-serif;font-size:1.8rem;font-weight:900;text-align:center;
background:linear-gradient(90deg,#00e5ff,#fff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:6px}
.sub{text-align:center;color:rgba(255,255,255,.3);font-size:.7rem;letter-spacing:3px;margin-bottom:30px}
.info{background:#08081a;border:1px solid rgba(0,229,255,.2);border-radius:10px;padding:16px;margin-bottom:20px;font-size:.75rem;line-height:1.9;color:rgba(255,255,255,.6)}
code{color:#00e5ff;background:rgba(0,229,255,.1);padding:2px 6px;border-radius:4px}
.st{font-family:'Orbitron',sans-serif;font-size:.65rem;color:#00e5ff;letter-spacing:2px;margin:20px 0 10px;display:flex;align-items:center;gap:10px}
.st::after{content:'';flex:1;height:1px;background:rgba(0,229,255,.15)}
.ep{display:flex;align-items:center;gap:10px;background:#0d0d22;border:1px solid rgba(0,229,255,.15);border-radius:10px;padding:12px 16px;margin-bottom:8px;text-decoration:none;transition:.2s}
.ep:hover{border-color:rgba(0,229,255,.5);background:rgba(0,229,255,.05)}
.badge{font-family:'Orbitron',sans-serif;font-size:.55rem;font-weight:700;background:rgba(0,229,255,.15);border:1px solid rgba(0,229,255,.4);color:#00e5ff;padding:4px 10px;border-radius:6px;flex-shrink:0}
.path{flex:1;font-size:.78rem}.desc{font-size:.6rem;color:rgba(255,255,255,.4)}
</style></head><body><div class="wrap">
<h1>THEY GOOD TV</h1>
<p class="sub">Stream API ÃÂ· v6.0 ÃÂ· ${Object.keys(CANALES).length} canales</p>
<div class="info">
  En <code>canales.json</code> usa tipo <code>iframe</code> y el link del player:<br>
  <code>"reproductores": ["https://theygoodtv-server.onrender.com/live/ecuavisa/player"]</code><br><br>
  <span style="color:#00ff99">Ã¢ÂÂ FIJO</span> = stream hardcodeado (siempre disponible) &nbsp;|&nbsp; 
  <span style="color:#ffc800">Ã¢ÂÂ DIN</span> = extraÃÂ­do dinÃÂ¡micamente
</div>
${secciones}
<div class="st">UTILIDADES</div>
<a class="ep" href="/canales" target="_blank"><span class="badge">GET</span><span class="path">/canales</span><span class="desc">Lista JSON de todos los canales</span></a>
<a class="ep" href="/health" target="_blank"><span class="badge">GET</span><span class="path">/health</span><span class="desc">Estado del servidor</span></a>
</div></body></html>`);
});

app.listen(PORT, () => {
  const fijos = Object.values(CANALES).filter(c => c.embedFijo).length;
  console.log(`\nÃ¢ÂÂ THEY GOOD TV Server v6.0 Ã¢ÂÂ Puerto ${PORT}`);
  console.log(`Ã°ÂÂÂ¡ ${Object.keys(CANALES).length} canales (${fijos} con stream fijo, ${Object.keys(CANALES).length - fijos} dinÃÂ¡micos)`);
  console.log(`Ã°ÂÂÂ Canales: ${Object.keys(CANALES).join(", ")}\n`);
});
