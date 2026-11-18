// Funciones que comparten todas las pruebas.
const http = require('http')
const path = require('path')
const puppeteer = require('puppeteer')

const PUERTO = 3200
const URL_APP = `http://localhost:${PUERTO}`
const ARCHIVOS = path.join(__dirname, '..', 'archivos')

// "npm run test:ver" abre el navegador visible y más lento, para mostrarlo en clase.
// "npm test" lo ejecuta sin ventana (headless), que es más rápido.
const VER_NAVEGADOR = process.env.npm_lifecycle_event === 'test:ver'

// ---------- Servidor de la aplicación ----------

// Arranca server.js dentro del proceso de Jest (así Jest mide la cobertura del backend).
// server.js no exporta el servidor, así que guardamos el que crea app.listen() para poder cerrarlo.
async function iniciarServidor() {
  process.env.PORT = PUERTO
  process.env.ANTHROPIC_API_KEY = 'clave-de-prueba' // la IA real nunca se llama: se simula
  const crearOriginal = http.createServer
  let servidor
  http.createServer = (...args) => (servidor = crearOriginal(...args))
  jest.spyOn(console, 'log').mockImplementation(() => {}) // oculta "Servidor en http://..."
  require('../../server')
  http.createServer = crearOriginal
  await new Promise((listo) => (servidor.listening ? listo() : servidor.once('listening', listo)))
  return servidor
}

async function detenerServidor(servidor) {
  servidor.closeAllConnections() // cierra las conexiones que Chrome deja abiertas
  await new Promise((listo) => servidor.close(listo))
  require('../../database/db').close() // libera el archivo feria.db
}

// Deja la base de datos vacía (cada prueba empieza desde cero)
function limpiarBaseDeDatos() {
  const db = require('../../database/db')
  db.exec('DELETE FROM venta_imagenes; DELETE FROM venta_items; DELETE FROM ventas; DELETE FROM sqlite_sequence;')
}

// ---------- Navegador ----------

function abrirNavegador() {
  return puppeteer.launch({
    headless: !VER_NAVEGADOR,
    slowMo: VER_NAVEGADOR ? 40 : 0,
    defaultViewport: { width: 1280, height: 900 },
    // Solo en Linux como usuario root (por ejemplo, en un servidor de integración) Chrome pide esta opción
    args: process.getuid && process.getuid() === 0 ? ['--no-sandbox'] : [],
  })
}

// Abre una pestaña nueva en la app. Los confirm() se aceptan automáticamente (como en clase),
// o se cancelan si se pasa { aceptarDialogos: false }.
async function abrirApp(browser, { aceptarDialogos = true } = {}) {
  const page = await browser.newPage()
  page.on('dialog', async (dialog) => {
    if (aceptarDialogos) await dialog.accept()
    else await dialog.dismiss()
  })
  await page.goto(URL_APP, { waitUntil: 'networkidle0' })
  return page
}

// Guarda una captura de la página al final de cada prueba (evidencia de ejecución).
// El archivo se llama como el caso: evidencias/capturas/TC-02.png, BUG-01.png...
const fs = require('fs')
const CAPTURAS = path.join(__dirname, '..', 'evidencias', 'capturas')
const repetidos = {}
async function guardarEvidencia(page) {
  if (!page || page.isClosed()) return
  const nombre = expect.getState().currentTestName || ''
  const id = (nombre.match(/(TC|BUG)-\d+/) || ['prueba'])[0]
  repetidos[id] = (repetidos[id] || 0) + 1 // TC-17 tiene varias filas: TC-17.png, TC-17-2.png...
  const archivo = repetidos[id] === 1 ? `${id}.png` : `${id}-${repetidos[id]}.png`
  fs.mkdirSync(CAPTURAS, { recursive: true })
  await page.screenshot({ path: path.join(CAPTURAS, archivo), fullPage: true })
}

// ---------- Acciones sobre la página ----------

// Escribe un producto en la fila número "n" (empieza en 1) del formulario
async function llenarFila(page, n, { producto, cantidad, precio }) {
  const fila = `#items .fila:nth-child(${n})`
  if (producto !== undefined) await page.type(`${fila} .producto`, String(producto))
  if (cantidad !== undefined) await page.type(`${fila} .cantidad`, String(cantidad))
  if (precio !== undefined) await page.type(`${fila} .precio`, String(precio))
}

// Clic en "Guardar venta" y espera a que aparezca un mensaje
async function guardarVenta(page) {
  await page.$eval('#mensaje', (m) => (m.textContent = ''))
  await page.click('button[type=submit]')
  await page.waitForFunction(() => document.querySelector('#mensaje').textContent !== '')
  return leerMensaje(page)
}

function leerMensaje(page) {
  return page.$eval('#mensaje', (m) => m.textContent.trim())
}

// Sube archivos al campo de imágenes (como si el usuario los eligiera)
async function subirArchivos(page, ...nombres) {
  const input = await page.$('#imagenes')
  await input.uploadFile(...nombres.map((n) => path.join(ARCHIVOS, n)))
}

// Llama a la API desde el navegador (para casos que la página no permite hacer)
function llamarAPI(page, ruta, opciones = {}) {
  return page.evaluate(
    async (ruta, opciones) => {
      const r = await fetch(ruta, opciones)
      return { status: r.status, cuerpo: await r.json() }
    },
    ruta,
    opciones
  )
}

// Envía una venta directamente a la API, saltándose la validación de la página
function enviarVentaPorAPI(page, items) {
  return page.evaluate(async (items) => {
    const datos = new FormData()
    datos.append('items', typeof items === 'string' ? items : JSON.stringify(items))
    const r = await fetch('/api/ventas', { method: 'POST', body: datos })
    return { status: r.status, cuerpo: await r.json() }
  }, items)
}

// ---------- Simulación de la IA ----------

// La app llama a la API de Anthropic para leer imágenes. Para no depender de Internet ni de una
// clave real, reemplazamos fetch SOLO para esa dirección y devolvemos una respuesta fija.
function simularIA({ status = 200, texto, error } = {}) {
  const fetchOriginal = global.fetch
  return jest.spyOn(global, 'fetch').mockImplementation(async (url, opciones) => {
    if (!String(url).includes('api.anthropic.com')) return fetchOriginal(url, opciones)
    const cuerpo = status === 200 ? { content: [{ type: 'text', text: texto }] } : { error: { message: error } }
    return new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })
  })
}

module.exports = {
  URL_APP,
  iniciarServidor,
  detenerServidor,
  limpiarBaseDeDatos,
  abrirNavegador,
  abrirApp,
  llenarFila,
  guardarVenta,
  leerMensaje,
  subirArchivos,
  llamarAPI,
  enviarVentaPorAPI,
  simularIA,
  guardarEvidencia,
}
