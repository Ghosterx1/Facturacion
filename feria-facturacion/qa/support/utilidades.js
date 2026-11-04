const { test: base, expect } = require('@playwright/test');

// PNG mínimo válido (1x1). Se le puede añadir un marcador de texto para el doble de la IA.
const PNG_1x1 = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000' +
  '1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex');
const png = (nombre = 'producto.png', marcador = '') => ({
  name: nombre, mimeType: 'image/png', buffer: Buffer.concat([PNG_1x1, Buffer.from(marcador)])
});
const archivoDeTamano = (bytes, nombre = 'grande.png') => ({
  name: nombre, mimeType: 'image/png', buffer: Buffer.concat([PNG_1x1, Buffer.alloc(bytes - PNG_1x1.length)])
});

// Envía una venta a la API como lo hace la interfaz (multipart con el campo "items" en JSON).
async function crearVenta(request, items, archivos = []) {
  const form = new FormData();
  form.append('items', typeof items === 'string' ? items : JSON.stringify(items));
  for (const a of archivos) form.append('imagenes', new Blob([a.buffer], { type: a.mimeType }), a.name);
  const r = await request.post('/api/ventas', { multipart: form });
  let cuerpo; try { cuerpo = await r.json(); } catch { cuerpo = await r.text(); }
  return { status: r.status(), cuerpo };
}

async function leerImagen(request, archivo) {
  const form = new FormData();
  if (archivo) form.append('imagen', new Blob([archivo.buffer], { type: archivo.mimeType }), archivo.name);
  const r = await request.post('/api/leer-imagen', { multipart: form });
  return { status: r.status(), cuerpo: await r.json() };
}

async function limpiarVentas(request) {
  const ventas = await (await request.get('/api/ventas')).json();
  for (const v of ventas) await request.delete(`/api/ventas/${v.id}`);
}

// Llena las filas del formulario de la interfaz. filas = [{producto, cantidad, precio}]
async function llenarFilas(page, filas) {
  for (let i = 0; i < filas.length; i++) {
    if (i > 0) await page.click('#btn-agregar');
    const fila = page.locator('#items .fila').nth(i);
    const f = filas[i];
    if (f.producto !== undefined) await fila.locator('.producto').fill(String(f.producto));
    if (f.cantidad !== undefined) await fila.locator('.cantidad').fill(String(f.cantidad));
    if (f.precio !== undefined) await fila.locator('.precio').fill(String(f.precio));
  }
}

// Adjunta evidencia JSON (petición/respuesta) al reporte HTML.
async function evidencia(testInfo, nombre, datos) {
  await testInfo.attach(nombre, { body: JSON.stringify(datos, null, 2), contentType: 'application/json' });
}

// Fixture: cada caso empieza con la base de datos vacía.
const test = base.extend({
  limpio: [async ({ request }, use) => { await limpiarVentas(request); await use(); }, { auto: true }]
});

module.exports = { test, expect, png, archivoDeTamano, crearVenta, leerImagen, limpiarVentas, llenarFilas, evidencia };

// Evidencia visual de pruebas de API: dibuja petición y respuesta en una página y la captura.
const fs = require('fs');
const path = require('path');
const DIR_EVIDENCIAS = path.join(__dirname, '..', 'evidencias');
fs.mkdirSync(DIR_EVIDENCIAS, { recursive: true });
const escHtml = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

async function capturaApi(page, id, titulo, pasos) {
  const filas = pasos.map(p => `<section><h3>${escHtml(p.paso)}</h3><pre>${escHtml(typeof p.datos === 'string' ? p.datos : JSON.stringify(p.datos, null, 2))}</pre></section>`).join('');
  await page.setContent(`<html><body style="font-family:system-ui;padding:20px;max-width:1000px">
    <h2>${escHtml(id)} · ${escHtml(titulo)}</h2><p style="color:#666">Evidencia de ejecución · ${new Date().toISOString()}</p>${filas}
    <style>pre{background:#f4f5fb;padding:10px;border-radius:8px;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:hidden}h3{margin:14px 0 4px}</style></body></html>`);
  await page.screenshot({ path: path.join(DIR_EVIDENCIAS, `${id}.png`), fullPage: true });
}
const captura = (page, id) => page.screenshot({ path: path.join(DIR_EVIDENCIAS, `${id}.png`), fullPage: true });

module.exports.capturaApi = capturaApi;
module.exports.captura = captura;
