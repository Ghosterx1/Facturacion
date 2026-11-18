// PRUEBAS DE LA LECTURA DE IMÁGENES CON IA.
// La app le pide a la API de Anthropic que lea los productos de una foto o recibo.
// Aquí la IA se SIMULA (simularIA): así las pruebas no dependen de Internet ni de una clave real,
// y podemos probar cada respuesta posible: éxito, error de clave, respuesta rara o vacía.
const {
  iniciarServidor, detenerServidor, limpiarBaseDeDatos, abrirNavegador, abrirApp,
  subirArchivos, leerMensaje, simularIA, llamarAPI,
  guardarEvidencia,
} = require('./soporte/utilidades')

// Clic en "Leer imágenes con IA" y espera a que termine (el botón se vuelve a habilitar)
async function leerConIA(page) {
  await page.click('#btn-ia')
  await page.waitForFunction(() => !document.querySelector('#btn-ia').disabled && !document.querySelector('#mensaje').textContent.startsWith('Leyendo'))
  return leerMensaje(page)
}

// Lee los valores de todas las filas del formulario
const leerFilas = (page) =>
  page.$$eval('#items .fila', (filas) =>
    filas.map((f) => [f.querySelector('.producto').value, f.querySelector('.cantidad').value, f.querySelector('.precio').value])
  )

const RESPUESTA_RECIBO = JSON.stringify({
  items: [
    { producto: 'Empanada', cantidad: 2, precio_unitario: 2500 },
    { producto: 'Gaseosa', cantidad: 1, precio_unitario: 3000 },
  ],
})

describe('Lectura de imágenes con IA', () => {
  let servidor
  let browser
  let page

  beforeAll(async () => {
    servidor = await iniciarServidor()
    browser = await abrirNavegador()
  })

  beforeEach(async () => {
    limpiarBaseDeDatos()
    process.env.ANTHROPIC_API_KEY = 'clave-de-prueba'
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

  it('TC-25 Debería pedir una imagen antes de usar la IA', async () => {
    expect(await leerConIA(page)).toBe('Primero selecciona al menos una imagen.')
  })

  it('TC-26 Debería llenar el formulario con los productos que lee la IA', async () => {
    simularIA({ texto: RESPUESTA_RECIBO })
    await subirArchivos(page, 'recibo.jpg')

    const mensaje = await leerConIA(page)

    expect(mensaje).toBe('La IA encontró 2 producto(s). Revisa los datos antes de guardar.')
    expect(await leerFilas(page)).toEqual([
      ['Empanada', '2', '2500'],
      ['Gaseosa', '1', '3000'],
    ])
  })

  it('TC-27 Debería entender la respuesta aunque la IA la envuelva en ```json', async () => {
    simularIA({ texto: '```json\n' + RESPUESTA_RECIBO + '\n```' })
    await subirArchivos(page, 'recibo.jpg')

    await leerConIA(page)

    expect(await leerFilas(page)).toHaveLength(2)
  })

  it('TC-28 Debería juntar los productos de varias imágenes', async () => {
    simularIA({ texto: JSON.stringify({ items: [{ producto: 'Brownie', cantidad: 1, precio_unitario: 3500 }] }) })
    await subirArchivos(page, 'producto.png', 'recibo.jpg')

    const mensaje = await leerConIA(page)

    expect(mensaje).toBe('La IA encontró 2 producto(s). Revisa los datos antes de guardar.')
    expect(await leerFilas(page)).toHaveLength(2)
  })

  it('TC-29 Debería avisar cuando la IA no encuentra productos', async () => {
    simularIA({ texto: '{"items":[]}' })
    await subirArchivos(page, 'producto.png')

    expect(await leerConIA(page)).toBe('La IA no encontró productos legibles. Ingrésalos manualmente.')
    expect(await leerFilas(page)).toEqual([['', '', '']]) // queda una fila vacía para escribir a mano
  })

  it('TC-30 Debería mostrar un error y dejar usar el formulario si la IA rechaza la clave', async () => {
    simularIA({ status: 401, error: 'invalid x-api-key' })
    await subirArchivos(page, 'producto.png')

    const mensaje = await leerConIA(page)
    const clase = await page.$eval('#mensaje', (m) => m.className)
    const botonActivo = await page.$eval('#btn-ia', (b) => !b.disabled)

    expect(mensaje).not.toBe('')
    expect(clase).toContain('error')
    expect(botonActivo).toBe(true) // el usuario puede reintentar o escribir a mano
  })

  it('TC-31 Debería pedir ingresar los datos a mano si la IA responde algo que no es JSON', async () => {
    simularIA({ texto: 'Lo siento, no puedo leer esta imagen.' })
    await subirArchivos(page, 'producto.png')

    expect(await leerConIA(page)).toBe('No se pudo interpretar la imagen. Ingresa los datos manualmente.')
  })

  it('TC-32 Debería avisar si falta la clave de la IA en el archivo .env', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await subirArchivos(page, 'producto.png')

    expect(await leerConIA(page)).toBe('Falta ANTHROPIC_API_KEY en el archivo .env. Puedes ingresar los datos manualmente.')
  })

  it('TC-33 Debería rechazar un formato de imagen que la IA no soporta (BMP)', async () => {
    const ia = simularIA({ texto: RESPUESTA_RECIBO })
    await subirArchivos(page, 'imagen.bmp')

    expect(await leerConIA(page)).toBe('Formato no soportado (usa JPG, PNG, GIF o WEBP)')
    expect(ia.mock.calls.filter(([url]) => String(url).includes('anthropic'))).toHaveLength(0) // ni siquiera llamó a la IA
  })

  it('TC-34 La API debería responder 400 si no se envía ninguna imagen', async () => {
    const r = await llamarAPI(page, '/api/leer-imagen', { method: 'POST' })

    expect(r.status).toBe(400)
    expect(r.cuerpo.error).toBe('No se recibió ninguna imagen')
  })
})
