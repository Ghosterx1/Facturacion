// PRUEBAS POSITIVAS: el usuario usa la aplicación de la forma correcta.
const {
  iniciarServidor, detenerServidor, limpiarBaseDeDatos, abrirNavegador, abrirApp,
  llenarFila, guardarVenta, subirArchivos,
  guardarEvidencia,
} = require('./soporte/utilidades')

describe('Registro de ventas (pruebas positivas)', () => {
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

  it('TC-01 Debería cargar la página con el formulario y el resumen en cero', async () => {
    const titulo = await page.title()
    const filas = await page.$$eval('#items .fila', (f) => f.length)
    const total = await page.$eval('#kpi-total', (el) => el.textContent)
    const transacciones = await page.$eval('#kpi-trans', (el) => el.textContent)
    const historial = await page.$eval('#historial', (el) => el.textContent.trim())

    expect(titulo).toBe('Feria Universitaria · Facturación')
    expect(filas).toBe(1)
    expect(total).toBe('$0')
    expect(transacciones).toBe('0')
    expect(historial).toBe('Sin transacciones todavía.')
  })

  it('TC-02 Debería registrar una venta con un producto', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 2, precio: 3500 })

    const mensaje = await guardarVenta(page)
    await page.waitForSelector('#historial .venta')
    const venta = await page.$eval('#historial .venta-cab', (el) => el.textContent)

    expect(mensaje).toBe('Venta registrada ✔')
    expect(venta).toContain('Venta #1')
    expect(venta).toContain('$7.000')
  })

  it('TC-03 Debería registrar una venta con varios productos y sumar el total', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 2, precio: 3500 })
    await page.click('#btn-agregar')
    await llenarFila(page, 2, { producto: 'Jugo de mango', cantidad: 1, precio: 4000 })

    await guardarVenta(page)
    await page.waitForFunction(() => document.querySelector('#kpi-total').textContent === '$11.000')
    const productos = await page.$$eval('#historial tr td:first-child', (tds) => tds.map((td) => td.textContent))

    expect(productos).toEqual(['Brownie', 'Jugo de mango'])
    expect(await page.$eval('#kpi-trans', (el) => el.textContent)).toBe('1')
  })

  it('TC-04 Debería guardar una venta con imágenes y mostrar sus miniaturas', async () => {
    await subirArchivos(page, 'producto.png', 'recibo.jpg')
    const vistaPrevia = await page.$$eval('#preview img', (imgs) => imgs.length)
    await llenarFila(page, 1, { producto: 'Galletas', cantidad: 3, precio: 1500 })

    await guardarVenta(page)
    await page.waitForSelector('#historial .miniaturas img')
    const miniaturas = await page.$$eval('#historial .miniaturas img', (imgs) => imgs.map((i) => i.naturalWidth > 0))

    expect(vistaPrevia).toBe(2)
    expect(miniaturas).toEqual([true, true]) // las dos imágenes cargan desde /uploads
  })

  it('TC-05 Debería mostrar los productos más vendidos sin importar mayúsculas', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 2, precio: 3500 })
    await guardarVenta(page)
    await llenarFila(page, 1, { producto: 'brownie', cantidad: 3, precio: 3500 })
    await page.click('#btn-agregar')
    await llenarFila(page, 2, { producto: 'Café', cantidad: 1, precio: 2000 })
    await guardarVenta(page)

    await page.waitForFunction(() => document.querySelectorAll('#top .barra').length === 2)
    const top = await page.$$eval('#top .barra', (barras) => barras.map((b) => b.textContent.replace(/\s+/g, ' ').trim()))

    expect(top[0]).toContain('5 u · $17.500') // 2 + 3 brownies juntos
    expect(top[1]).toContain('Café')
  })

  it('TC-06 Debería dejar el formulario limpio después de guardar', async () => {
    await subirArchivos(page, 'producto.png')
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1, precio: 3500 })
    await page.click('#btn-agregar')
    await llenarFila(page, 2, { producto: 'Café', cantidad: 1, precio: 2000 })

    await guardarVenta(page)
    const filas = await page.$$eval('#items .fila', (f) => f.length)
    const producto = await page.$eval('#items .producto', (el) => el.value)
    const vistaPrevia = await page.$$eval('#preview img', (imgs) => imgs.length)
    const archivos = await page.$eval('#imagenes', (el) => el.files.length)

    expect(filas).toBe(1)
    expect(producto).toBe('')
    expect(vistaPrevia).toBe(0)
    expect(archivos).toBe(0)
  })
})
