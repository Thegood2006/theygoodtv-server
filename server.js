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
  res.json({ 
    name: "THEY GOOD TV API",
    endpoints: ["/streams", "/canal/:nombre", "/proxy?url=...", "/health"]
  });
});

app.listen(PORT, () => {
  console.log(`THEY GOOD TV Server corriendo en puerto ${PORT}`);
});
