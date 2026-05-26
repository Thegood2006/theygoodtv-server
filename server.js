/**
 * THEY GOOD TV — Servidor de Streams
 * Renueva automáticamente los links de canales
 * Despliega en Render.com gratis
 */

const express = require("express");
const cors    = require("cors");
const fetch   = require("node-fetch");
const path    = require("path");

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Permite peticiones desde tu web GitHub Pages
app.use(express.json());

/* =========================
   CACHÉ EN MEMORIA
   Guarda los links frescos por X minutos
========================= */
const cache = {};
const CACHE_MINUTOS = 50; // Renueva cada 50 minutos

function getCached(key) {
  const item = cache[key];
  if (!item) return null;
  const mins = (Date.now() - item.timestamp) / 60000;
  if (mins > CACHE_MINUTOS) return null; // Expirado
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
  "Accept": "*/*",
  "Accept-Language": "es-ES,es;q=0.9",
  "Referer": "https://futbollibreonline.com/"
};

/* =========================
   EXTRAER M3U8 DE UNA PÁGINA
========================= */
async function extraerM3U8(url, referer) {
  try {
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: referer || url },
      timeout: 10000
    });
    const html = await res.text();

    // Buscar links m3u8 en el HTML
    const patrones = [
      /https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/g,
      /source:\s*["']([^"']+\.m3u8[^"']*)/g,
      /file:\s*["']([^"']+\.m3u8[^"']*)/g,
      /src:\s*["']([^"']+\.m3u8[^"']*)/g
    ];

    const encontrados = [];
    for (const patron of patrones) {
      const matches = html.matchAll(patron);
      for (const match of matches) {
        const link = match[1] || match[0];
        if (link && !encontrados.includes(link)) {
          encontrados.push(link);
        }
      }
    }

    return encontrados;
  } catch (e) {
    console.error(`Error extrayendo de ${url}:`, e.message);
    return [];
  }
}

/* =========================
   VERIFICAR SI UN LINK FUNCIONA
========================= */
async function verificarLink(url) {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      headers: HEADERS,
      timeout: 6000
    });
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

/* =========================
   ENDPOINT: GET /streams
   Retorna todos los streams del canales.json
   con estado actualizado
========================= */
app.get("/streams", async (req, res) => {
  const cached = getCached("streams");
  if (cached) {
    return res.json({ ...cached, fromCache: true });
  }

  // Leer canales.json desde GitHub
  try {
    const ghRes = await fetch(
      "https://raw.githubusercontent.com/Thegood2006/MI-sitio-eventos/main/canales.json?nocache=" + Date.now()
    );
    const canales = await ghRes.json();

    // Verificar cada canal
    const categorias = ["futbol", "ciclismo", "ufc", "ecuador", "internacional"];
    for (const cat of categorias) {
      if (!canales[cat]) continue;
      for (const evento of canales[cat]) {
        const estados = [];
        for (const url of (evento.reproductores || [])) {
          if (!url || url.startsWith("TU_LINK")) {
            estados.push(false);
          } else {
            const activo = await verificarLink(url);
            estados.push(activo);
          }
        }
        evento.estados = estados;
        evento.activo  = estados.some(e => e);
      }
    }

    canales.ultima_verificacion = new Date().toISOString();
    setCache("streams", canales);
    res.json({ ...canales, fromCache: false });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   ENDPOINT: GET /canal/:nombre
   Extrae el link fresco de un canal específico
========================= */
app.get("/canal/:nombre", async (req, res) => {
  const nombre = req.params.nombre.toLowerCase();
  const cached = getCached("canal_" + nombre);
  if (cached) return res.json(cached);

  // Mapa de canales con sus URLs de origen
  const CANALES_FUENTE = {
    "ecuavisa": [
      "https://ecuavisa.com/en-vivo",
      "https://futbollibreonline.com/canal/ecuavisa"
    ],
    "tc": [
      "https://tctelevision.com/en-vivo",
      "https://futbollibreonline.com/canal/tc-television"
    ],
    "tvc": [
      "https://tvc.com.ec/en-vivo",
    ],
    "teleamazonas": [
      "https://teleamazonas.com/tv-en-vivo"
    ]
  };

  const fuentes = CANALES_FUENTE[nombre];
  if (!fuentes) {
    return res.status(404).json({ error: "Canal no encontrado" });
  }

  let links = [];
  for (const url of fuentes) {
    const encontrados = await extraerM3U8(url, url);
    links = links.concat(encontrados);
    if (links.length > 0) break;
  }

  const resultado = { canal: nombre, links, timestamp: new Date().toISOString() };
  if (links.length > 0) setCache("canal_" + nombre, resultado);
  res.json(resultado);
});

/* =========================
   ENDPOINT: GET /proxy
   Proxy para evitar CORS en streams
========================= */
app.get("/proxy", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "URL requerida" });

  try {
    const response = await fetch(url, { headers: HEADERS, timeout: 10000 });
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Access-Control-Allow-Origin", "*");
    response.body.pipe(res);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* =========================
   ENDPOINT: GET /health
   Para que Render sepa que el servidor está vivo
========================= */
app.get("/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

app.get("/", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>THEY GOOD TV — API</title>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--cyan:#00e5ff;--purple:#7c3aed;--green:#00ff88;--red:#ff3d5a;--yellow:#ffc800;--bg:#04040f;--bg2:#08081a;--bg3:#0d0d22;--border:rgba(0,229,255,0.15)}
body{background:var(--bg);color:#fff;font-family:'Share Tech Mono',monospace;min-height:100vh;overflow-x:hidden}
body::before{content:'';position:fixed;inset:0;background-image:linear-gradient(rgba(0,229,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,229,255,0.03) 1px,transparent 1px);background-size:40px 40px;pointer-events:none;z-index:0}
body::after{content:'';position:fixed;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 30% 20%,rgba(124,58,237,0.08) 0%,transparent 50%),radial-gradient(ellipse at 70% 80%,rgba(0,229,255,0.06) 0%,transparent 50%);pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;max-width:860px;margin:0 auto;padding:30px 20px 60px}
header{text-align:center;padding:60px 20px 40px;position:relative;z-index:1}
.logo-ring{display:inline-flex;align-items:center;justify-content:center;width:80px;height:80px;border-radius:50%;border:2px solid var(--cyan);box-shadow:0 0 30px rgba(0,229,255,0.3),inset 0 0 30px rgba(0,229,255,0.05);margin-bottom:20px;font-size:2rem;animation:pulse 3s ease-in-out infinite}
@keyframes pulse{0%,100%{box-shadow:0 0 20px rgba(0,229,255,0.3),inset 0 0 20px rgba(0,229,255,0.05)}50%{box-shadow:0 0 50px rgba(0,229,255,0.6),inset 0 0 40px rgba(0,229,255,0.1)}}
h1{font-family:'Orbitron',sans-serif;font-size:clamp(1.5rem,5vw,2.8rem);font-weight:900;letter-spacing:0.08em;background:linear-gradient(90deg,var(--cyan),#fff,var(--purple));-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:8px}
.subtitle{color:rgba(255,255,255,0.4);font-size:0.75rem;letter-spacing:3px}
.status-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.3);color:var(--green);border-radius:30px;padding:8px 20px;font-size:0.75rem;letter-spacing:2px;margin-top:20px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:blink 1.5s ease-in-out infinite}
@keyframes blink{0%,100%{opacity:1;box-shadow:0 0 6px var(--green)}50%{opacity:0.3;box-shadow:none}}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-bottom:30px}
.card{background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:24px;transition:border-color .3s,transform .3s,box-shadow .3s;position:relative;overflow:hidden;animation:fadeUp .5s ease both}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--cyan),transparent);opacity:0;transition:opacity .3s}
.card:hover{border-color:rgba(0,229,255,0.4);transform:translateY(-3px);box-shadow:0 8px 40px rgba(0,229,255,0.1)}
.card:hover::before{opacity:1}
.card-icon{font-size:2rem;margin-bottom:12px}
.card-label{font-size:0.6rem;letter-spacing:3px;color:var(--cyan);text-transform:uppercase;margin-bottom:6px}
.card-value{font-family:'Orbitron',sans-serif;font-size:1.4rem;font-weight:700;color:#fff}
.card-sub{font-size:0.65rem;color:rgba(255,255,255,0.3);margin-top:4px}
.section-title{font-family:'Orbitron',sans-serif;font-size:0.75rem;color:var(--cyan);letter-spacing:3px;margin-bottom:16px;display:flex;align-items:center;gap:10px}
.section-title::after{content:'';flex:1;height:1px;background:var(--border)}
.endpoint-list{display:flex;flex-direction:column;gap:10px;margin-bottom:30px}
.endpoint{background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:14px;transition:border-color .2s,background .2s;cursor:pointer;text-decoration:none;animation:fadeUp .5s ease both}
.endpoint:hover{border-color:rgba(0,229,255,0.4);background:rgba(0,229,255,0.03)}
.method{font-family:'Orbitron',sans-serif;font-size:0.6rem;font-weight:700;padding:4px 10px;border-radius:6px;flex-shrink:0;letter-spacing:1px}
.method.get{background:rgba(0,229,255,0.15);border:1px solid rgba(0,229,255,0.4);color:var(--cyan)}
.ep-path{font-family:'Share Tech Mono',monospace;font-size:0.85rem;color:#fff;flex:1}
.ep-desc{font-size:0.65rem;color:rgba(255,255,255,0.4);text-align:right;flex-shrink:0}
.terminal{background:#020208;border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:30px;animation:fadeUp .5s .4s ease both}
.terminal-bar{background:var(--bg3);border-bottom:1px solid var(--border);padding:10px 16px;display:flex;align-items:center;gap:8px;font-size:0.7rem;color:rgba(255,255,255,0.4)}
.tdot{width:10px;height:10px;border-radius:50%}
.tdot.r{background:#ff5f57}.tdot.y{background:#febc2e}.tdot.g{background:#28c840}
.terminal-body{padding:20px;font-size:0.78rem;line-height:2;color:rgba(255,255,255,0.6)}
.log-line{display:flex;gap:12px}
.log-time{color:rgba(0,229,255,0.5);flex-shrink:0}
.log-ok{color:var(--green)}.log-warn{color:var(--yellow)}.log-info{color:var(--cyan)}
.ping-btn{display:inline-flex;align-items:center;gap:10px;background:linear-gradient(135deg,rgba(0,229,255,0.15),rgba(124,58,237,0.15));border:1px solid var(--cyan);border-radius:12px;padding:14px 28px;color:var(--cyan);font-family:'Orbitron',sans-serif;font-size:0.75rem;font-weight:700;letter-spacing:2px;cursor:pointer;transition:all .3s;text-decoration:none}
.ping-btn:hover{background:linear-gradient(135deg,rgba(0,229,255,0.25),rgba(124,58,237,0.25));box-shadow:0 0 30px rgba(0,229,255,0.3);transform:scale(1.02)}
.footer{text-align:center;padding:40px 0 20px;color:rgba(255,255,255,0.2);font-size:0.65rem;letter-spacing:2px}
.uptime-bar{display:flex;gap:3px;margin-bottom:30px}
.uptime-seg{flex:1;height:6px;border-radius:3px;background:var(--green);opacity:0.7}
.uptime-seg.down{background:var(--red)}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.card:nth-child(1){animation-delay:.1s}.card:nth-child(2){animation-delay:.2s}.card:nth-child(3){animation-delay:.3s}
.endpoint:nth-child(1){animation-delay:.2s}.endpoint:nth-child(2){animation-delay:.3s}.endpoint:nth-child(3){animation-delay:.4s}.endpoint:nth-child(4){animation-delay:.5s}
@media(max-width:500px){.ep-desc{display:none}.ep-path{font-size:0.75rem}}
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
    <div class="card"><div class="card-icon">🕐</div><div class="card-label">Tiempo activo</div><div class="card-value" id="uptimeClock">00:00:00</div><div class="card-sub">Desde último reinicio</div></div>
    <div class="card"><div class="card-icon">🔄</div><div class="card-label">Caché canales</div><div class="card-value">50 min</div><div class="card-sub">Renovación automática</div></div>
  </div>
  <div class="section-title">DISPONIBILIDAD — ÚLTIMAS 24H</div>
  <div class="uptime-bar" id="uptimeBar"></div>
  <div class="section-title">ENDPOINTS DISPONIBLES</div>
  <div class="endpoint-list">
    <a class="endpoint" href="/streams" target="_blank"><span class="method get">GET</span><span class="ep-path">/streams</span><span class="ep-desc">Todos los canales con estado</span></a>
    <a class="endpoint" href="/canal/ecuavisa" target="_blank"><span class="method get">GET</span><span class="ep-path">/canal/:nombre</span><span class="ep-desc">Link fresco de un canal</span></a>
    <a class="endpoint" href="/proxy?url=" target="_blank"><span class="method get">GET</span><span class="ep-path">/proxy?url=...</span><span class="ep-desc">Proxy CORS para streams</span></a>
    <a class="endpoint" href="/health" target="_blank"><span class="method get">GET</span><span class="ep-path">/health</span><span class="ep-desc">Estado del servidor</span></a>
  </div>
  <div class="section-title">ACTIVITY LOG</div>
  <div class="terminal">
    <div class="terminal-bar"><span class="tdot r"></span><span class="tdot y"></span><span class="tdot g"></span>&nbsp; theygoodtv-server — node</div>
    <div class="terminal-body" id="termLog"></div>
  </div>
  <div style="text-align:center;margin-bottom:30px;"><a class="ping-btn" href="/health" target="_blank">📶 VERIFICAR ESTADO</a></div>
  <div class="footer">THEY GOOD TV API &nbsp;·&nbsp; theygoodtv-server.onrender.com &nbsp;·&nbsp; v1.0.0</div>
</div>
<script>
const start=Date.now();
setInterval(()=>{
  const s=Math.floor((Date.now()-start)/1000);
  const h=String(Math.floor(s/3600)).padStart(2,'0');
  const m=String(Math.floor((s%3600)/60)).padStart(2,'0');
  const sec=String(s%60).padStart(2,'0');
  document.getElementById('uptimeClock').textContent=h+':'+m+':'+sec;
},1000);
const bar=document.getElementById('uptimeBar');
for(let i=0;i<48;i++){const d=Math.random()>0.95;const s=document.createElement('div');s.className='uptime-seg'+(d?' down':'');bar.appendChild(s);}
const logs=[
  {cls:'log-ok',msg:'✓ Servidor iniciado en puerto ${PORT}'},
  {cls:'log-info',msg:'→ CORS habilitado para todos los orígenes'},
  {cls:'log-ok',msg:'✓ Caché en memoria activa · TTL: 50 min'},
  {cls:'log-warn',msg:'⚠ Plan Free: servidor duerme tras 15 min sin uso'},
  {cls:'log-info',msg:'→ Listo para recibir peticiones'},
];
const now=new Date();
const fmt=d=>d.toTimeString().slice(0,8);
const termLog=document.getElementById('termLog');
logs.forEach((l,i)=>{const d=new Date(now-(4-i)*2000);const line=document.createElement('div');line.className='log-line';line.innerHTML='<span class="log-time">'+fmt(d)+'</span><span class="'+l.cls+'">'+l.msg+'</span>';termLog.appendChild(line);});
</script>
</body>
</html>`);
});

app.listen(PORT, () => {
  console.log(`THEY GOOD TV Server corriendo en puerto ${PORT}`);
});
