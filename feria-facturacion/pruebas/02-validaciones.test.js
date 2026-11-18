// PRUEBAS NEGATIVAS, DE VALORES LÍMITE Y DE TABLA DE DECISIÓN:
// el usuario se equivoca o intenta datos no permitidos, y la app debe impedirlo.
const {
  iniciarServidor, detenerServidor, limpiarBaseDeDatos, abrirNavegador, abrirApp,
  llenarFila, guardarVenta, subirArchivos, enviarVentaPorAPI, llamarAPI,
  guardarEvidencia,
} = require('./soporte/utilidades')

const ERROR_CAMPOS = 'Revisa los campos en rojo: producto obligatorio, cantidad entera > 0 y precio > 0.'

// Devuelve qué campos de la fila 1 quedaron marcados en rojo
const camposEnRojo = (page) =>
  page.$$eval('#items .fila:first-child input.invalido', (inputs) => inputs.map((i) => i.className.split(' ')[0]))

describe('Validaciones (pruebas negativas y valores límite)', () => {
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

  it('TC-07 No debería guardar una venta con el formulario vacío', async () => {
    const mensaje = await guardarVenta(page)

    expect(mensaje).toBe(ERROR_CAMPOS)
    expect(await camposEnRojo(page)).toEqual(['producto', 'cantidad', 'precio'])
  })

  it('TC-08 No debería aceptar cantidad 0 (valor límite inferior)', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 0, precio: 3500 })

    expect(await guardarVenta(page)).toBe(ERROR_CAMPOS)
    expect(await camposEnRojo(page)).toEqual(['cantidad'])
  })

  it('TC-09 No debería aceptar una cantidad con decimales', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1.5, precio: 3500 })

    expect(await guardarVenta(page)).toBe(ERROR_CAMPOS)
    expect(await camposEnRojo(page)).toEqual(['cantidad'])
  })

  it('TC-10 No debería aceptar precio 0 ni precio negativo', async () => {
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1, precio: 0 })
    expect(await guardarVenta(page)).toBe(ERROR_CAMPOS)

    await page.$eval('#items .precio', (el) => (el.value = ''))
    await llenarFila(page, 1, { precio: -100 })
    expect(await guardarVenta(page)).toBe(ERROR_CAMPOS)
    expect(await camposEnRojo(page)).toEqual(['precio'])
  })

  it('TC-11 Debería aceptar los valores mínimos válidos: cantidad 1 y precio 0.01', async () => {
    await llenarFila(page, 1, { producto: 'Chicle', cantidad: 1, precio: 0.01 })

    expect(await guardarVenta(page)).toBe('Venta registrada ✔')
    await page.waitForFunction(() => document.querySelector('#kpi-total').textContent === '$0,01')
  })

  it('TC-12 No debería dejar quitar la única fila, pero sí una fila extra', async () => {
    await page.click('#items .fila:nth-child(1) .quitar')
    expect(await page.$$eval('#items .fila', (f) => f.length)).toBe(1)

    await page.click('#btn-agregar')
    await page.click('#btn-agregar')
    await page.click('#items .fila:nth-child(2) .quitar')
    expect(await page.$$eval('#items .fila', (f) => f.length)).toBe(2)
  })

  it('TC-13 No debería aceptar un archivo que no es imagen', async () => {
    await subirArchivos(page, 'documento.txt')
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1, precio: 3500 })

    expect(await guardarVenta(page)).toBe('Solo se permiten imágenes')
    const ventas = await llamarAPI(page, '/api/ventas')
    expect(ventas.cuerpo).toHaveLength(0)
  })

  it('TC-14 Debería avisar cuando no se puede conectar con el servidor', async () => {
    // Puppeteer intercepta la petición y la corta, como si el servidor estuviera caído
    await page.setRequestInterception(true)
    page.on('request', (req) => (req.url().endsWith('/api/ventas') && req.method() === 'POST' ? req.abort() : req.continue()))
    await llenarFila(page, 1, { producto: 'Brownie', cantidad: 1, precio: 3500 })

    expect(await guardarVenta(page)).toBe('No se pudo conectar con el servidor.')
  })

  // La página valida antes de enviar, pero el servidor también debe validar.
  // Estas pruebas envían los datos directo a la API, saltándose la página.
  it('TC-15 La API debería rechazar una venta sin productos', async () => {
    const r = await enviarVentaPorAPI(page, [])

    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('Agrega al menos un producto')
  })

  it('TC-16 La API debería rechazar datos que no son JSON', async () => {
    const r = await enviarVentaPorAPI(page, '{esto no es json')

    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('Datos inválidos')
  })

  // TABLA DE DECISIÓN: cada fila combina un producto, una cantidad y un precio, y dice qué debe responder la API.
  describe('Tabla de decisión de la API de ventas', () => {
    const tabla = [
      // producto     cantidad  precio   status  mensaje esperado
      ['Brownie',     2,        3500,    201,    undefined],
      ['',            2,        3500,    400,    'Fila 1: el nombre del producto es obligatorio'],
      ['   ',         2,        3500,    400,    'Fila 1: el nombre del producto es obligatorio'],
      ['Brownie',     0,        3500,    400,    'Fila 1: la cantidad debe ser un entero positivo'],
      ['Brownie',     -1,       3500,    400,    'Fila 1: la cantidad debe ser un entero positivo'],
      ['Brownie',     2.5,      3500,    400,    'Fila 1: la cantidad debe ser un entero positivo'],
      ['Brownie',     2,        0,       400,    'Fila 1: el precio debe ser mayor a cero'],
      ['Brownie',     2,        'abc',   400,    'Fila 1: el precio debe ser mayor a cero'],
    ]

    it.each(tabla)('TC-17 producto "%s", cantidad %p, precio %p → %i', async (producto, cantidad, precio, status, mensaje) => {
      const r = await enviarVentaPorAPI(page, [{ producto, cantidad, precio_unitario: precio }])

      expect(r.status).toBe(status)
      if (mensaje) expect(r.cuerpo.error).toBe(mensaje)
      else expect(r.cuerpo.id).toBe(1)
    })

    it('TC-18 Debería decir en qué fila está el error cuando hay varios productos', async () => {
      const r = await enviarVentaPorAPI(page, [
        { producto: 'Brownie', cantidad: 1, precio_unitario: 3500 },
        { producto: 'Café', cantidad: 0, precio_unitario: 2000 },
      ])

      expect(r.status).toBe(400)
      expect(r.cuerpo.error).toBe('Fila 2: la cantidad debe ser un entero positivo')
    })
  })
})
