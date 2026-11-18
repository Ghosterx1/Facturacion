// PRUEBAS DE TRANSICIÓN DE ESTADOS: el historial pasa por "sin ventas" → "con ventas" → "venta eliminada".
const {
  URL_APP, iniciarServidor, detenerServidor, limpiarBaseDeDatos, abrirNavegador, abrirApp,
  llenarFila, guardarVenta, subirArchivos,
  guardarEvidencia,
} = require('./soporte/utilidades')

// Registra una venta desde el formulario y espera a que aparezca en el historial
async function registrarVenta(page, producto, cantidad, precio) {
  const antes = await page.$$eval('#historial .venta', (v) => v.length)
  await llenarFila(page, 1, { producto, cantidad, precio })
  await guardarVenta(page)
  await page.waitForFunction((n) => document.querySelectorAll('#historial .venta').length === n, {}, antes + 1)
}

const contarVentas = (page) => page.$$eval('#historial .venta', (v) => v.length)
const leerKpis = async (page) => ({
  total: await page.$eval('#kpi-total', (el) => el.textContent),
  transacciones: await page.$eval('#kpi-trans', (el) => el.textContent),
})

describe('Historial de ventas (transición de estados)', () => {
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
    if (page) await page.close()
  })

  afterAll(async () => {
    if (browser) await browser.close()
    if (servidor) await detenerServidor(servidor)
  })

  it('TC-19 Debería pasar de "sin ventas" a "con ventas" y volver a "sin ventas"', async () => {
    // Estado 1: sin ventas
    expect(await page.$eval('#historial', (el) => el.textContent.trim())).toBe('Sin transacciones todavía.')
    expect(await page.$eval('#top', (el) => el.textContent.trim())).toBe('Aún no hay ventas.')

    // Estado 2: con dos ventas
    await registrarVenta(page, 'Brownie', 2, 3500)
    await registrarVenta(page, 'Café', 1, 2000)
    expect(await contarVentas(page)).toBe(2)
    expect(await leerKpis(page)).toEqual({ total: '$9.000', transacciones: '2' })

    // Estado 3: se elimina una (la más reciente aparece primero)
    await page.click('#historial .venta:first-child .quitar')
    await page.waitForFunction(() => document.querySelectorAll('#historial .venta').length === 1)
    expect(await leerKpis(page)).toEqual({ total: '$7.000', transacciones: '1' })

    // Estado 4: se elimina la última y se vuelve al inicio
    await page.click('#historial .venta:first-child .quitar')
    await page.waitForFunction(() => document.querySelector('#historial').textContent.includes('Sin transacciones'))
    expect(await leerKpis(page)).toEqual({ total: '$0', transacciones: '0' })
  })

  it('TC-20 Debería mostrar las ventas de la más reciente a la más antigua', async () => {
    await registrarVenta(page, 'Brownie', 1, 3500)
    await registrarVenta(page, 'Café', 1, 2000)
    await registrarVenta(page, 'Jugo', 1, 4000)

    const titulos = await page.$$eval('#historial .venta-cab strong', (s) => s.map((x) => x.textContent.split(' · ')[0]))
    expect(titulos).toEqual(['Venta #3', 'Venta #2', 'Venta #1'])
  })

  it('TC-21 No debería eliminar la venta si el usuario cancela la confirmación', async () => {
    await registrarVenta(page, 'Brownie', 1, 3500)
    await page.close()

    page = await abrirApp(browser, { aceptarDialogos: false })
    await page.waitForSelector('#historial .venta')
    await page.click('#historial .venta:first-child .quitar')
    await new Promise((listo) => setTimeout(listo, 500))

    expect(await contarVentas(page)).toBe(1)
  })

  it('TC-22 Debería conservar las ventas al recargar la página', async () => {
    await registrarVenta(page, 'Brownie', 2, 3500)

    await page.reload({ waitUntil: 'networkidle0' })

    expect(await contarVentas(page)).toBe(1)
    expect(await leerKpis(page)).toEqual({ total: '$7.000', transacciones: '1' })
  })

  it('TC-23 Al eliminar una venta también debería borrar sus imágenes', async () => {
    await subirArchivos(page, 'producto.png')
    await registrarVenta(page, 'Brownie', 1, 3500)
    const imagen = await page.$eval('#historial .miniaturas img', (img) => img.getAttribute('src'))
    expect((await fetch(URL_APP + imagen)).status).toBe(200)

    await page.click('#historial .venta:first-child .quitar')
    await page.waitForFunction(() => document.querySelector('#historial').textContent.includes('Sin transacciones'))
    await new Promise((listo) => setTimeout(listo, 300)) // el archivo se borra en segundo plano

    expect((await fetch(URL_APP + imagen)).status).toBe(404)
  })

  it('TC-24 Eliminar una venta no debería afectar a las demás', async () => {
    await registrarVenta(page, 'Brownie', 1, 3500)
    await registrarVenta(page, 'Café', 1, 2000)

    await page.click('#historial .venta:first-child .quitar') // elimina la #2 (la más reciente)
    await page.waitForFunction(() => document.querySelectorAll('#historial .venta').length === 1)
    const quedan = await page.$eval('#historial .venta-cab strong', (s) => s.textContent)

    expect(quedan).toContain('Venta #1')
    expect(await leerKpis(page)).toEqual({ total: '$3.500', transacciones: '1' })
  })
})
