// PRUEBAS EN OTROS DISPOSITIVOS: celular emulado y ventana de incógnito (como en emular.test.js de clase).
const { KnownDevices } = require('puppeteer')
const {
  URL_APP, iniciarServidor, detenerServidor, limpiarBaseDeDatos, abrirNavegador,
  llenarFila, guardarVenta,
  guardarEvidencia,
} = require('./soporte/utilidades')

describe('Uso desde un celular y en incógnito', () => {
  let servidor
  let browser
  let context
  let page

  beforeAll(async () => {
    servidor = await iniciarServidor()
    browser = await abrirNavegador()
  })

  beforeEach(async () => {
    limpiarBaseDeDatos()
    // Contexto de incógnito: sin cookies ni caché de otras pruebas
    context = await browser.createBrowserContext()
    page = await context.newPage()
    page.on('dialog', async (dialog) => {
      await dialog.accept()
    })
  })

  afterEach(async () => {
    await guardarEvidencia(page)
    if (context) await context.close()
  })

  afterAll(async () => {
    if (browser) await browser.close()
    if (servidor) await detenerServidor(servidor)
  })

  it('TC-35 Debería registrar una venta desde un iPhone emulado', async () => {
    await page.emulate(KnownDevices['iPhone 13'])
    await page.goto(URL_APP, { waitUntil: 'networkidle0' })

    // En el celular se toca la pantalla en vez de hacer clic
    await page.tap('#items .producto')
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1, precio: 3500 })
    const mensaje = await guardarVenta(page)

    expect(mensaje).toBe('Venta registrada ✔')
    await page.waitForSelector('#historial .venta')
  })

  it('TC-36 La página no debería tener desplazamiento horizontal en un celular', async () => {
    await page.emulate({
      viewport: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true, isLandscape: false },
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    })
    await page.goto(URL_APP, { waitUntil: 'networkidle0' })

    const anchoPagina = await page.evaluate(() => document.documentElement.scrollWidth)

    expect(anchoPagina).toBeLessThanOrEqual(375)
  })

  it('TC-37 Una ventana de incógnito debería ver las mismas ventas (los datos están en el servidor)', async () => {
    await page.goto(URL_APP, { waitUntil: 'networkidle0' })
    await llenarFila(page, 1, { producto: 'Café', cantidad: 2, precio: 2000 })
    await guardarVenta(page)

    const otraVentana = await browser.createBrowserContext()
    const otraPagina = await otraVentana.newPage()
    await otraPagina.goto(URL_APP, { waitUntil: 'networkidle0' })
    const transacciones = await otraPagina.$eval('#kpi-trans', (el) => el.textContent)
    await otraVentana.close()

    expect(transacciones).toBe('1')
  })
})
