# THEY GOOD TV — Servidor

## Cómo subir a Render.com

1. Crea un repo nuevo en GitHub llamado `theygoodtv-server`
2. Sube estos archivos: `server.js`, `package.json`
3. Entra a `render.com` → New → Web Service
4. Conecta el repo `theygoodtv-server`
5. Configuración:
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Plan: Free
6. Deploy

## Endpoints

- `GET /streams` — todos los canales con estado
- `GET /canal/ecuavisa` — link fresco de Ecuavisa
- `GET /canal/tc` — link fresco de TC Televisión
- `GET /proxy?url=...` — proxy para streams con CORS
- `GET /health` — estado del servidor

## URL del servidor
Después de deployar en Render tendrás una URL como:
`https://theygoodtv-server.onrender.com`
