// ═══════════════════════════════════════════════════════
//   THEY GOOD TV — SERVER v5.3
//   Render.com · Node 18+ · Express (sin Puppeteer)
//   FIX: caché genérica para canales.json Y contenido.json
//   FIX: fallback a caché vieja si GitHub responde 429
//   FIX: endpoints /raw/canales y /raw/contenido para que
//        admin.html e index.html YA NO le peguen directo
//        a raw.githubusercontent.com (eso causaba los 429)
// ═══════════════════════════════════════════════════════

const express = require("express");
const cors    = require("cors");
const https   = require("https");
const http    = require("http");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ── URLs base ─────────────────────────────────────────
const GITHUB_RAW    = "https://raw.githubusercontent.com/Thegood2006/MI-sitio-eventos/main";
const CANALES_URL   = GITHUB_RAW + "/canales.json";
const CONTENIDO_URL = GITHUB_RAW + "/contenido.json";

// ═══════════════════════════════════════════════════════
//   CACHÉ EN MEMORIA GENÉRICA · TTL 50 min
//   FIX: si GitHub falla (429, timeout, etc), NO se rompe:
//   se devuelve la última copia buena que se tenga guardada,
//   aunque esté vencida. Solo falla si nunca se pudo cargar.
// ═══════════════════════════════════════════════════════
const CACHE_TTL = 50 * 60 * 1000;
const cacheStore = {
  canales:   { data: null, time: 0 },
  contenido: { data: null, time: 0 },
};

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib.get(url, { headers: { "User-Agent": "TGTV-Server/5.3" } }, (res) => {
      // FIX: si GitHub responde 429 / 5xx, no intentes parsear el
      // cuerpo como JSON (era HTML/texto y rompía todo con
      // "Unexpected non-whitespace character after JSON").
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume(); // descarta el cuerpo
        return reject(new Error("HTTP " + res.statusCode + " al pedir " + url));
      }
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error("JSON parse error en " + url + ": " + e.message)); }
      });
    }).on("error", reject);
  });
}

// Espera ms milisegundos
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Obtiene un JSON con caché + reintento + fallback a caché vieja
async function obtenerConCache(key, url) {
  const entry = cacheStore[key];
  const fresco = entry.data && (Date.now() - entry.time < CACHE_TTL);
  if (fresco) return entry.data;

  // Intenta refrescar (con 1 reintento si es 429)
  for (let intento = 0; intento < 2; intento++) {
    try {
      const data = await fetchJson(url);
      cacheStore[key] = { data, time: Date.now() };
      return data;
    } catch (e) {
      const es429 = /HTTP 429/.test(e.message);
      if (es429 && intento === 0) {
        await sleep(1500); // pequeña espera antes de reintentar
        continue;
      }
      // Si hay una copia vieja en caché, mejor devolver eso que romper
      if (entry.data) {
        console.warn(`⚠️ ${key}: fallo al refrescar (${e.message}), usando caché vieja.`);
        return entry.data;
      }
      throw e; // no hay nada guardado, no queda otra que fallar
    }
  }
}

async function obtenerCanales()   { return obtenerConCache("canales", CANALES_URL); }
async function obtenerContenido() { return obtenerConCache("contenido", CONTENIDO_URL); }

// ═══════════════════════════════════════════════════════
//   CANALES CON STREAM FIJO HARDCODED
// ═══════════════════════════════════════════════════════
const CANALES_SERVER = {
  "teleamazonas": {
    nombre: "Teleamazonas",
    url: "https://teleamazonas.com/envivo",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://teleamazonas-live.cdn.vustreams.com/live/fd4ab346-b4e3-4628-abf0-b5a1bc192428/live.isml/fd4ab346-b4e3-4628-abf0-b5a1bc192428.m3u8",
      embeds: ["https://teleamazonas-live.cdn.vustreams.com/live/fd4ab346-b4e3-4628-abf0-b5a1bc192428/live.isml/fd4ab346-b4e3-4628-abf0-b5a1bc192428.m3u8"],
      fuente: "manual"
    }
  },
  "dw-espanol": {
    nombre: "DW Español",
    url: "https://www.dw.com/es/television-en-vivo/s-100837",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8",
      embeds: ["https://dwamdstream104.akamaized.net/hls/live/2015530/dwstream104/index.m3u8"],
      fuente: "manual"
    }
  },
  "euronews": {
    nombre: "Euronews Español",
    url: "https://es.euronews.com/live",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://rakuten-euronews-1-es.samsung.wurl.tv/manifest/playlist.m3u8",
      embeds: ["https://rakuten-euronews-1-es.samsung.wurl.tv/manifest/playlist.m3u8"],
      fuente: "manual"
    }
  },
  "america-estereo": {
    nombre: "América Estéreo",
    url: "https://video.makrodigital.com/americaestereoguayaquil",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://video.makrodigital.com/americaestereoguayaquil/americaestereoguayaquil/playlist.m3u8",
      embeds: ["https://video.makrodigital.com/americaestereoguayaquil/americaestereoguayaquil/playlist.m3u8"],
      fuente: "manual"
    }
  },
  "zaracay": {
    nombre: "Zaracay TV",
    url: "https://video2.makrodigital.com/zaracay",
    embedFijo: {
      tipo:  "m3u8",
      embed: "https://video2.makrodigital.com/zaracay/zaracay/playlist.m3u8",
      embeds: ["https://video2.makrodigital.com/zaracay/zaracay/playlist.m3u8"],
      fuente: "manual"
    }
  },

};

// ═══════════════════════════════════════════════════════
//   HELPERS DE REPRODUCTOR
// ═══════════════════════════════════════════════════════
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
//   PÁGINA DE INICIO (panel dinámico) — sin cambios de fondo
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
<title>THEY GOOD TV — Panel</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--cyan:#00e5ff;--purple:#7c3aed;--green:#00ff88;--red:#ff3d5a;--yellow:#ffc800;--bg:#04040f;--bg2:#08081a;--bg3:#0d0d22;--border:rgba(0,229,255,0.15)}
  body{background:var(--bg);color:#fff;font-family:'Share Tech Mono',monospace;min-height:100vh;overflow-x:hidden}
  body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,229,255,0.03)1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03)1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
  .wrap{position:relative;z-index:1;max-width:1000px;margin:0 auto;padding:40px 20px}
  header{text-align:center;padding:60px 20px 40px;position:relative;z-index:1}
  .logo-ring{display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:2px solid var(--cyan);box-shadow:0 0 30px rgba(0,229,255,0.3);margin-bottom:20px;animation:pulse 3s ease-in-out infinite;font-size:2rem}
  @keyframes pulse{0%,100%{box-shadow:0 0 20px rgba(0,229,255,0.3)}50%{box-shadow:0 0 50px rgba(0,229,255,0.6)}}
  h1{font-family:'Orbitron',sans-serif;font-size:clamp(1.5rem,5vw,2.8rem);font-weight:900;letter-spacing:0.08em;background:linear-gradient(90deg,var(--cyan),#fff,var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:8px}
  .subtitle{color:rgba(255,255,255,0.4);font-size:0.75rem;letter-spacing:3px;text-transform:uppercase}
  .status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);color:var(--green);border-radius:30px;padding:8px 20px;font-size:0.75rem;letter-spacing:2px;margin-top:20px;transition:.3s}
  .status-dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:blink 1.5s ease-in-out infinite}
  @keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
  .explainer{background:var(--bg2);border:1px solid var(--border);border-left:3px solid var(--cyan);border-radius:8px;padding:18px 20px;margin-bottom:28px;font-size:0.82rem;line-height:1.7;color:rgba(255,255,255,0.72)}
  .explainer b{color:#fff}
  .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-bottom:28px}
  .card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;transition:.3s}
  .card:hover{border-color:rgba(0,229,255,0.4);transform:translateY(-3px)}
  .card-icon{font-size:2rem;margin-bottom:12px}
  .card-label{font-size:0.6rem;letter-spacing:3px;color:var(--cyan);text-transform:uppercase;margin-bottom:6px}
  .card-value{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:700;color:#fff}
  .card-sub{font-size:0.65rem;color:rgba(255,255,255,0.3);margin-top:4px}
  .section-title{font-family:'Orbitron',sans-serif;font-size:0.8rem;color:var(--cyan);letter-spacing:3px;margin-bottom:6px;display:flex;align-items:center;gap:10px}
  .section-title::after{content:'';flex:1;height:1px;background:var(--border)}
  .section-help{font-size:0.7rem;color:rgba(255,255,255,0.35);margin-bottom:16px}
  .search-box input{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:12px 16px;color:#fff;font-family:'Share Tech Mono',monospace;font-size:0.85rem;margin-bottom:14px;outline:none;transition:.2s}
  .search-box input:focus{border-color:var(--cyan)}
  .search-box input::placeholder{color:rgba(255,255,255,0.25)}
  .chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
  .chip{background:var(--bg3);border:1px solid var(--border);border-radius:20px;padding:7px 16px;font-size:0.68rem;letter-spacing:0.5px;cursor:pointer;color:rgba(255,255,255,0.55);transition:.2s;user-select:none}
  .chip:hover{border-color:rgba(0,229,255,0.4);color:#fff}
  .chip.active{border-color:var(--cyan);color:var(--cyan);background:rgba(0,229,255,0.08)}
  .channels-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;margin-bottom:30px}
  .channel-card{background:var(--bg2);border:1px solid var(--border);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:8px;transition:.2s}
  .channel-card:hover{border-color:rgba(0,229,255,0.4);transform:translateY(-2px)}
  .cat-badge{font-size:0.55rem;letter-spacing:1.5px;text-transform:uppercase;padding:3px 9px;border-radius:6px;width:fit-content}
  .ch-name{font-family:'Orbitron',sans-serif;font-size:0.92rem;font-weight:700;line-height:1.3}
  .ch-tipo{font-size:0.65rem;color:rgba(255,255,255,0.4)}
  a.ch-btn{margin-top:auto;text-align:center;background:rgba(0,229,255,0.1);border:1px solid rgba(0,229,255,0.3);border-radius:8px;padding:9px;color:var(--cyan);text-decoration:none;font-size:0.68rem;letter-spacing:1px;transition:.2s}
  a.ch-btn:hover{background:rgba(0,229,255,0.2)}
  .empty-state{grid-column:1/-1;text-align:center;padding:50px 20px;color:rgba(255,255,255,0.35);font-size:0.8rem;line-height:1.8}
  .endpoint-list{display:flex;flex-direction:column;gap:10px;margin-bottom:30px}
  .endpoint{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:14px;transition:.2s;cursor:pointer;text-decoration:none;color:inherit}
  .endpoint:hover{border-color:rgba(0,229,255,0.4)}
  .method{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;padding:4px 10px;border-radius:6px;flex-shrink:0;letter-spacing:1px;background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.4);color:var(--cyan)}
  .ep-path{font-family:'Share Tech Mono',monospace;font-size:0.85rem;color:#fff;flex-shrink:0}
  .ep-desc{font-size:0.68rem;color:rgba(255,255,255,0.45);text-align:right;flex:1}
  .footer{text-align:center;padding:40px 0 20px;color:rgba(255,255,255,0.2);font-size:0.65rem;letter-spacing:2px}
  @media (max-width:560px){
    .endpoint{flex-wrap:wrap}
    .ep-desc{text-align:left;flex-basis:100%}
  }
</style>
</head>
<body>
<header>
  <div class="logo-ring">📡</div>
  <h1>THEY GOOD TV</h1>
  <p class="subtitle">Panel del servidor</p>
  <div class="status-badge" id="statusBadge"><span class="status-dot"></span> SERVIDOR ACTIVO</div>
</header>
<div class="wrap">
  <div class="explainer">
    <b>¿Qué es esto?</b> Este servidor le entrega canales de TV en vivo a la app THEY GOOD TV.
    Tiene dos fuentes: unos <b>canales fijos</b> escritos directo en el código (${Object.keys(CANALES_SERVER).length} en total,
    abajo dice cuáles) y una lista más grande que viene de archivos <code>canales.json</code> y
    <code>contenido.json</code> guardados en GitHub. Esos archivos se guardan en memoria por 50 minutos
    para no pedirlos todo el tiempo a GitHub y evitar el límite de peticiones (error 429). Como usa el
    plan gratis de Render, <b>el servidor se apaga solo tras 15 min sin visitas</b> y tarda unos segundos
    en despertar la próxima vez que alguien entra.
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-icon">⚡</div>
      <div class="card-label">Estado</div>
      <div class="card-value" style="color:var(--green)" id="estadoTexto">ONLINE</div>
      <div class="card-sub">Render.com · Plan gratis</div>
    </div>
    <div class="card">
      <div class="card-icon">🕐</div>
      <div class="card-label">Tiempo despierto</div>
      <div class="card-value">${uptime}</div>
      <div class="card-sub">Desde el último reinicio</div>
    </div>
    <div class="card">
      <div class="card-icon">📺</div>
      <div class="card-label">Canales totales</div>
      <div class="card-value" id="totalCanales">—</div>
      <div class="card-sub">Fijos + desde GitHub</div>
    </div>
  </div>

  <div class="section-title">CANALES</div>
  <div class="section-help">Esta lista se carga en vivo desde tu propio servidor (/streams). Busca o filtra por categoría.</div>
  <div class="search-box">
    <input type="text" id="buscador" placeholder="Buscar canal por nombre...">
  </div>
  <div class="chips" id="chips"></div>
  <div class="channels-grid" id="channelsGrid">
    <div class="empty-state">Cargando canales...</div>
  </div>

  <div class="section-title">ENDPOINTS (para revisar cosas a mano)</div>
  <div class="section-help">Cada uno abre en una pestaña nueva y muestra datos en bruto (JSON o el reproductor).</div>
  <div class="endpoint-list">
    <a class="endpoint" href="/streams" target="_blank">
      <span class="method">GET</span><span class="ep-path">/streams</span>
      <span class="ep-desc">Todos los canales juntos (fijos + GitHub), tal como los usa esta página</span>
    </a>
    <a class="endpoint" href="/canales" target="_blank">
      <span class="method">GET</span><span class="ep-path">/canales</span>
      <span class="ep-desc">Solo los canales fijos escritos en el código del servidor</span>
    </a>
    <a class="endpoint" href="/raw/canales" target="_blank">
      <span class="method">GET</span><span class="ep-path">/raw/canales</span>
      <span class="ep-desc">canales.json tal cual está en GitHub, pero cacheado (evita 429)</span>
    </a>
    <a class="endpoint" href="/raw/contenido" target="_blank">
      <span class="method">GET</span><span class="ep-path">/raw/contenido</span>
      <span class="ep-desc">contenido.json tal cual está en GitHub, pero cacheado (evita 429)</span>
    </a>
    <a class="endpoint" href="/canal/dw-espanol" target="_blank">
      <span class="method">GET</span><span class="ep-path">/canal/:nombre</span>
      <span class="ep-desc">Busca un canal de GitHub por su nombre (en minúsculas, con guiones)</span>
    </a>
    <a class="endpoint" href="/live/dw-espanol/player" target="_blank">
      <span class="method">GET</span><span class="ep-path">/live/:id/player</span>
      <span class="ep-desc">Abre el reproductor de un canal fijo (id, no nombre completo)</span>
    </a>
    <a class="endpoint" href="/health" target="_blank">
      <span class="method">GET</span><span class="ep-path">/health</span>
      <span class="ep-desc">Confirma si el servidor está despierto y desde cuándo</span>
    </a>
  </div>

  <div class="footer">THEY GOOD TV API · theygoodtv-server.onrender.com · v5.3.0</div>
</div>

<script>
  const catColors = {
    futbol: '#00ff88', ciclismo: '#ffc800', ufc: '#ff3d5a',
    ecuador: '#00e5ff', internacional: '#7c3aed', eventos: '#ffc800',
    servidor: '#7c3aed'
  };
  const catLabels = {
    futbol: 'Fútbol', ciclismo: 'Ciclismo', ufc: 'UFC',
    ecuador: 'Ecuador', internacional: 'Internacional',
    eventos: 'Eventos', servidor: 'Canal fijo del servidor'
  
  "tvc": {
    nombre: "tvc",
    url: "tvc",
    embedFijo: {
      tipo: "m3u8",
      embed: "https://d2m7i0pvomh4vg.cloudfront.net/medialist_15609871089997455276_hls.m3u8",
      embeds: ["https://d2m7i0pvomh4vg.cloudfront.net/medialist_15609871089997455276_hls.m3u8", "https://d2m7i0pvomh4vg.cloudfront.net/ts:abr.m3u8"],
      fuente: "manual"
    }
  },
};
  let TODOS = [];
  let filtroActual = 'todos';

  async function actualizarSalud() {
    const badge = document.getElementById('statusBadge');
    const estadoTexto = document.getElementById('estadoTexto');
    try {
      const r = await fetch('/health');
      if (!r.ok) throw new Error('bad status');
      badge.innerHTML = '<span class="status-dot"></span> SERVIDOR ACTIVO';
      badge.style.color = 'var(--green)';
      badge.style.borderColor = 'rgba(0,255,136,0.3)';
      badge.style.background = 'rgba(0,255,136,0.1)';
      estadoTexto.textContent = 'ONLINE';
      estadoTexto.style.color = 'var(--green)';
    } catch (e) {
      badge.innerHTML = '<span class="status-dot" style="background:var(--red)"></span> SIN RESPUESTA (puede estar dormido)';
      badge.style.color = 'var(--red)';
      badge.style.borderColor = 'rgba(255,61,90,0.3)';
      badge.style.background = 'rgba(255,61,90,0.1)';
      estadoTexto.textContent = 'OFFLINE';
      estadoTexto.style.color = 'var(--red)';
    }
  }

  async function cargarCanales() {
    const cont = document.getElementById('channelsGrid');
    try {
      const r = await fetch('/streams');
      const data = await r.json();
      TODOS = data.canales || [];
      document.getElementById('totalCanales').textContent = TODOS.length;
      construirChips();
      pintarCanales();
    } catch (e) {
      cont.innerHTML = '<div class="empty-state">⚠ No se pudo cargar la lista de canales.<br>Revisa si el servidor está despierto en <a href="/health" target="_blank" style="color:var(--cyan)">/health</a>.</div>';
    }
  }

  function construirChips() {
    const cats = ['todos', ...new Set(TODOS.map(c => c.categoria))];
    const chipsEl = document.getElementById('chips');
    chipsEl.innerHTML = cats.map(cat => {
      const count = cat === 'todos' ? TODOS.length : TODOS.filter(c => c.categoria === cat).length;
      const label = cat === 'todos' ? 'Todos' : (catLabels[cat] || cat);
      return '<div class="chip' + (cat === filtroActual ? ' active' : '') + '" data-cat="' + cat + '">' + label + ' (' + count + ')</div>';
    }).join('');
    chipsEl.querySelectorAll('.chip').forEach(el => {
      el.addEventListener('click', () => {
        filtroActual = el.dataset.cat;
        construirChips();
        pintarCanales();
      });
    });
  }

  function pintarCanales() {
    const q = document.getElementById('buscador').value.toLowerCase().trim();
    let lista = TODOS;
    if (filtroActual !== 'todos') lista = lista.filter(c => c.categoria === filtroActual);
    if (q) lista = lista.filter(c => (c.nombre || '').toLowerCase().includes(q));
    const cont = document.getElementById('channelsGrid');
    if (!lista.length) {
      cont.innerHTML = '<div class="empty-state">No hay canales que coincidan con esa búsqueda o filtro.</div>';
      return;
    }
    cont.innerHTML = lista.map(c => {
      const color = catColors[c.categoria] || '#00e5ff';
      const tipoLabel = c.tipo === 'iframe' ? 'Ventana embebida (iframe)' : (c.tipo === 'dinamico' ? 'Reproductor propio' : 'Video directo (m3u8)');
      const link = (c.reproductores && c.reproductores[0]) || '#';
      return '<div class="channel-card">' +
        '<span class="cat-badge" style="background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55">' + (catLabels[c.categoria] || c.categoria) + '</span>' +
        '<div class="ch-name">' + c.nombre + '</div>' +
        '<div class="ch-tipo">' + tipoLabel + '</div>' +
        '<a class="ch-btn" href="' + link + '" target="_blank">▶ PROBAR CANAL</a>' +
        '</div>';
    }).join('');
  }

  document.getElementById('buscador').addEventListener('input', pintarCanales);
  actualizarSalud();
  cargarCanales();
  setInterval(actualizarSalud, 30000);
  setInterval(cargarCanales, 60000);
</script>
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
    version: "5.3.0",
    canalesServer: Object.keys(CANALES_SERVER).length,
  });
});

// ═══════════════════════════════════════════════════════
//   GET /canales
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
//   GET /raw/canales  y  GET /raw/contenido
//   FIX PRINCIPAL: estos endpoints son los que admin.html
//   (y luego index.html) deben usar EN VEZ de pegarle
//   directo a raw.githubusercontent.com. El server cachea
//   por 50 min y si GitHub responde 429 devuelve la copia
//   vieja en vez de romperse.
// ═══════════════════════════════════════════════════════
app.get("/raw/canales", async (req, res) => {
  try {
    const data = await obtenerCanales();
    res.json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: "No se pudo obtener canales.json: " + e.message });
  }
});

app.get("/raw/contenido", async (req, res) => {
  try {
    const data = await obtenerContenido();
    res.json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: "No se pudo obtener contenido.json: " + e.message });
  }
});

// ═══════════════════════════════════════════════════════
//   GET /streams
// ═══════════════════════════════════════════════════════
app.get("/streams", async (req, res) => {
  try {
    const gh = await obtenerCanales();
    const categorias = ["futbol","ciclismo","ufc","ecuador","internacional","eventos"];
    const todos = [];
    categorias.forEach((cat) => {
      (gh[cat] || []).forEach((c) => {
        todos.push({ ...c, categoria: cat });
      });
    });
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
// ═══════════════════════════════════════════════════════
app.get("/canal/:nombre", async (req, res) => {
  try {
    const gh   = await obtenerCanales();
    const name = req.params.nombre.toLowerCase();
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
// ═══════════════════════════════════════════════════════
app.get("/live/:id", async (req, res) => {
  const id    = req.params.id;
  const canal = CANALES_SERVER[id];
  if (!canal) {
    return res.status(404).json({ ok: false, error: "Canal no encontrado: " + id });
  }
  if (canal.embedFijo) {
    return res.json({
      ok:     true,
      id,
      nombre: canal.nombre,
      embed:  canal.embedFijo.embed,
      tipo:   canal.embedFijo.tipo,
      fuente: canal.embedFijo.fuente || "manual",
    });
  }
  res.status(501).json({
    ok: false,
    error: "Este canal no tiene un stream fijo configurado (embedFijo).",
  });
});

// ═══════════════════════════════════════════════════════
//   GET /live/:id/player
// ═══════════════════════════════════════════════════════
app.get("/live/:id/player", async (req, res) => {
  const id    = req.params.id;
  const canal = CANALES_SERVER[id];
  if (!canal) {
    return res.status(404).send(`<html><body style="background:#000;color:#ff3d5a;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:1.2rem;">
      ❌ Canal "${id}" no encontrado</body></html>`);
  }
  if (!canal.embedFijo) {
    return res.status(501).send(`<html><body style="background:#000;color:#ffc800;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;font-size:1rem;text-align:center;padding:20px;">
      ⚠ El canal "${canal.nombre}" no tiene un stream fijo configurado.</body></html>`);
  }
  res.setHeader("Content-Type", "text/html");
  res.send(playerHTML(canal, canal.embedFijo));
});

// ═══════════════════════════════════════════════════════
//   GET /proxy?url=...
// ═══════════════════════════════════════════════════════
app.get("/proxy", (req, res) => {
  const target = req.query.url;
  if (!target) {
    return res.status(400).json({ ok: false, error: "Falta parámetro url" });
  }
  const lib = target.startsWith("https") ? https : http;
  lib.get(target, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; TGTV/5.3)",
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
  console.log(`  THEY GOOD TV — Server v5.3`);
  console.log(`  Puerto: ${PORT}`);
  console.log(`  Canales hardcoded: ${Object.keys(CANALES_SERVER).length}`);
  console.log(`  Caché TTL: 50 min (canales.json y contenido.json)\n`);
});
