// DEFECTOS ENCONTRADOS (pruebas que FALLAN a propósito).
//
// Cada prueba comprueba lo que la aplicación DEBERÍA hacer. Fallan porque la aplicación tiene un
// defecto real: el mensaje del fallo muestra el resultado obtenido. Cuando el equipo de desarrollo
// corrija el defecto, la prueba pasará sola (sirve como prueba de regresión).
//
// Severidad: qué tan grave es el daño.  Prioridad: qué tan pronto hay que corregirlo.
const {
  iniciarServidor, detenerServidor, limpiarBaseDeDatos, abrirNavegador, abrirApp,
  llenarFila, guardarVenta, subirArchivos, llamarAPI, enviarVentaPorAPI, simularIA, leerMensaje,
  guardarEvidencia,
} = require('./soporte/utilidades')

// Sube archivos creados en el navegador (nombre, tipo y tamaño a elección) a una ruta de la API
function subirArchivosFalsos(page, ruta, campo, archivos, items) {
  return page.evaluate(
    async (ruta, campo, archivos, items) => {
      const datos = new FormData()
      if (items) datos.append('items', JSON.stringify(items))
      for (const a of archivos) {
        const contenido = a.tamano ? new Uint8Array(a.tamano) : a.contenido
        datos.append(campo, new Blob([contenido], { type: a.tipo }), a.nombre)
      }
      const r = await fetch(ruta, { method: 'POST', body: datos })
      return { status: r.status, cuerpo: await r.json() }
    },
    ruta, campo, archivos, items
  )
}

const UN_PRODUCTO = [{ producto: 'Brownie', cantidad: 1, precio_unitario: 3500 }]

describe('Defectos encontrados (pruebas fallidas)', () => {
  let servidor
  let browser
  let page

  beforeAll(async () => {
    servidor = await iniciarServidor()
    browser = await abrirNavegador()
  })

  beforeEach(async () => {
    limpiarBaseDeDatos()
    page = await abrirApp(browser)
  })

  afterEach(async () => {
    await guardarEvidencia(page)
    jest.restoreAllMocks()
    if (page) await page.close()
  })

  afterAll(async () => {
    if (browser) await browser.close()
    if (servidor) await detenerServidor(servidor)
  })

  // Severidad: CRÍTICA · Prioridad: ALTA
  it('BUG-01 No debería aceptar una página HTML disfrazada de imagen', async () => {
    // El servidor solo revisa el "tipo" que dice el navegador (se puede falsificar)
    // y guarda el archivo con su extensión original: .html
    const r = await subirArchivosFalsos(page, '/api/ventas', 'imagenes',
      [{ nombre: 'malicioso.html', tipo: 'image/png', contenido: '<script>alert("hackeado")</script>' }], UN_PRODUCTO)
    const ventas = await llamarAPI(page, '/api/ventas')
    const archivo = ventas.cuerpo[0] && ventas.cuerpo[0].imagenes[0]
    const tipoServido = archivo ? await page.evaluate(async (u) => (await fetch(u)).headers.get('content-type'), archivo) : null

    // Esperado: rechazo (400). Obtenido: se guarda y se sirve como página web (text/html)
    expect({ status: r.status, tipoServido }).toEqual({ status: 400, tipoServido: null })
  })

  // Severidad: ALTA · Prioridad: ALTA
  it('BUG-02 Registrar dos veces seguidas el botón Guardar no debería duplicar la venta', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1, precio: 3500 })

    // Doble clic rápido, como hace un usuario impaciente
    await Promise.all([page.click('button[type=submit]'), page.click('button[type=submit]')])
    await new Promise((listo) => setTimeout(listo, 1000))
    const ventas = await llamarAPI(page, '/api/ventas')

    expect(ventas.cuerpo).toHaveLength(1)
  })

  // Severidad: MEDIA · Prioridad: ALTA
  it('BUG-03 Un nombre de producto numérico no debería producir un error interno (500)', async () => {
    const r = await enviarVentaPorAPI(page, [{ producto: 123, cantidad: 1, precio_unitario: 1000 }])

    // Esperado: 201 (guardar "123") o 400 (rechazar). Obtenido: 500 "No se pudo guardar la venta"
    expect([201, 400]).toContain(r.status)
  })

  // Severidad: MEDIA · Prioridad: MEDIA
  it('BUG-04 Un precio enorme no debería dañar el total del resumen', async () => {
    await llenarFila(page, 1, { producto: 'Producto caro', cantidad: 2, precio: '1e308' })
    await guardarVenta(page)
    await page.waitForFunction(() => document.querySelector('#kpi-trans').textContent === '1')
    const resumen = await llamarAPI(page, '/api/resumen')

    // Esperado: rechazar el precio o mostrar un total válido. Obtenido: total null y KPI "$0" con 1 venta
    expect(resumen.cuerpo.total).not.toBeNull()
  })

  // Severidad: MEDIA · Prioridad: MEDIA
  it('BUG-05 El error de la IA debería mostrarse en español y explicar qué hacer', async () => {
    simularIA({ status: 401, error: 'invalid x-api-key' }) // la respuesta real de la API con una clave inválida
    await subirArchivos(page, 'producto.png')
    await page.click('#btn-ia')
    await page.waitForFunction(() => !document.querySelector('#btn-ia').disabled)

    // Esperado: un mensaje como "La clave de la IA no es válida...". Obtenido: "invalid x-api-key"
    expect(await leerMensaje(page)).toMatch(/clave|manual/i)
  })

  // Severidad: BAJA · Prioridad: MEDIA
  it('BUG-06 Subir más de 10 imágenes debería explicar el límite en español', async () => {
    const once = Array.from({ length: 11 }, (_, i) => ({ nombre: `foto${i}.png`, tipo: 'image/png', contenido: 'x' }))
    const r = await subirArchivosFalsos(page, '/api/ventas', 'imagenes', once, UN_PRODUCTO)

    // Esperado: "Máximo 10 imágenes por venta". Obtenido: "Unexpected file field"
    expect(r.cuerpo.error).toMatch(/imágenes|máximo|10/i)
  })

  // Severidad: BAJA · Prioridad: MEDIA
  it('BUG-07 Una imagen de más de 8 MB debería explicar el límite en español', async () => {
    const grande = [{ nombre: 'grande.png', tipo: 'image/png', tamano: 8 * 1024 * 1024 + 1 }]
    const r = await subirArchivosFalsos(page, '/api/ventas', 'imagenes', grande, UN_PRODUCTO)

    // Esperado: "La imagen supera el tamaño máximo de 8 MB". Obtenido: "File too large"
    expect(r.cuerpo.error).toMatch(/tamaño|MB|grande/i)
  })

  // Severidad: BAJA · Prioridad: BAJA
  it('BUG-08 El resumen debería agrupar "Café" y "CAFÉ" como el mismo producto', async () => {
    await enviarVentaPorAPI(page, [{ producto: 'Café', cantidad: 1, precio_unitario: 2000 }])
    await enviarVentaPorAPI(page, [{ producto: 'CAFÉ', cantidad: 1, precio_unitario: 2000 }])
    const resumen = await llamarAPI(page, '/api/resumen')

    // SQLite solo pasa a minúsculas las letras sin tilde: "CAFÉ" queda como "cafÉ"
    expect(resumen.cuerpo.top).toHaveLength(1)
  })

  // Severidad: BAJA · Prioridad: BAJA
  it('BUG-09 Un precio menor a un centavo no debería mostrar un total de $0', async () => {
    await llenarFila(page, 1, { producto: 'Caramelo', cantidad: 1, precio: 0.001 })
    await guardarVenta(page)
    await page.waitForFunction(() => document.querySelector('#kpi-trans').textContent === '1')
    const total = await page.$eval('#kpi-total', (el) => el.textContent)

    // Esperado: rechazar precios menores a 0,01 o mostrarlos. Obtenido: venta guardada y total "$0"
    expect(total).not.toBe('$0')
  })

  // Severidad: BAJA · Prioridad: BAJA
  it('BUG-10 Un nombre de producto muy largo no debería desbordar la página', async () => {
    await enviarVentaPorAPI(page, [{ producto: 'A'.repeat(500), cantidad: 1, precio_unitario: 1000 }])
    await page.reload({ waitUntil: 'networkidle0' })
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

    // Esperado: el nombre se corta o se ajusta. Obtenido: la página se desplaza en horizontal
    expect(desborde).toBeLessThanOrEqual(0)
  })

  // Severidad: BAJA · Prioridad: BAJA
  it('BUG-11 Eliminar una venta que no existe debería responder 404', async () => {
    const r = await llamarAPI(page, '/api/ventas/999', { method: 'DELETE' })

    // Esperado: 404 "Venta no encontrada". Obtenido: 200 {"ok": true}
    expect(r.status).toBe(404)
  })
})
