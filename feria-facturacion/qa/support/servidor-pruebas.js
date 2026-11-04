// Arranca la aplicación SIN modificarla, en condiciones controladas de prueba:
//  1. Base de datos y carpeta de uploads limpias.
//  2. Doble de prueba (stub) de la API de Anthropic: la app llama a fetch('https://api.anthropic.com/...')
//     y aquí se intercepta esa llamada para devolver respuestas deterministas.
//     El comportamiento se elige con un marcador de texto dentro de la imagen enviada:
//       IA_ERROR_CLAVE -> 401 "invalid x-api-key" (lo mismo que responde la API real con la clave del .env.example)
//       IA_BASURA      -> la IA responde texto que no es JSON
//       IA_VACIO       -> la IA no encuentra productos
//       IA_LENTO       -> respuesta normal con 1,5 s de retraso
//       (sin marcador) -> 2 productos: Empanada x3 a 2500 y Jugo x2 a 3000
//  3. Cierre ordenado con SIGTERM para que c8 escriba la cobertura.
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', '..');
fs.rmSync(path.join(APP, 'database', 'feria.db'), { force: true });
const uploads = path.join(APP, 'uploads');
for (const f of fs.readdirSync(uploads)) if (f !== '.gitkeep') fs.rmSync(path.join(uploads, f), { force: true });

process.env.ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || 'clave-de-prueba';

const fetchReal = global.fetch;
const respuesta = (status, cuerpo) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } });
const mensajeIA = texto => respuesta(200, { content: [{ type: 'text', text: texto }] });

global.fetch = async (url, opciones) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) return fetchReal(url, opciones);
  const cuerpo = JSON.parse(opciones.body);
  const img = cuerpo.messages[0].content.find(c => c.type === 'image');
  const bytes = Buffer.from(img.source.data, 'base64').toString('latin1');
  if (bytes.includes('IA_ERROR_CLAVE')) return respuesta(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
  if (bytes.includes('IA_BASURA')) return mensajeIA('Lo siento, no puedo leer esta imagen.');
  if (bytes.includes('IA_VACIO')) return mensajeIA('{"items":[]}');
  if (bytes.includes('IA_LENTO')) await new Promise(r => setTimeout(r, 1500));
  return mensajeIA('```json\n{"items":[{"producto":"Empanada","cantidad":3,"precio_unitario":2500},{"producto":"Jugo","cantidad":2,"precio_unitario":3000}]}\n```');
};

const salir = () => process.exit(0);
process.on('SIGTERM', salir);
process.on('SIGINT', salir);

// En Windows, Playwright cierra el servidor a la fuerza y no envía SIGTERM.
// Por eso el teardown global pide el apagado por este puerto de control (solo localhost),
// el proceso sale con normalidad y c8 alcanza a escribir la cobertura.
require('http').createServer((req, res) => {
  if (req.url === '/__apagar') { res.end('ok'); setTimeout(salir, 100); }
  else { res.statusCode = 404; res.end(); }
}).listen(Number(process.env.PUERTO_CONTROL || 3199), '127.0.0.1');

require(path.join(APP, 'server.js'));
