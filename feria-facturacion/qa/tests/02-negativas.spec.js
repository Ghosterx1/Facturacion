// Técnica: pruebas negativas (entradas inválidas que el sistema debe rechazar)
const { test, expect, png, crearVenta, llenarFilas, captura, capturaApi, evidencia } = require('../support/utilidades');

test.describe('Pruebas negativas', () => {
  test('TC-08 Guardar sin nombre de producto', async ({ page, request }) => {
    await page.goto('/');
    await llenarFilas(page, [{ cantidad: 1, precio: 1000 }]);
    await page.click('button[type=submit]');
    await expect(page.locator('#mensaje')).toContainText('Revisa los campos en rojo');
    await expect(page.locator('#items .producto')).toHaveClass(/invalido/);
    expect(await (await request.get('/api/ventas')).json()).toHaveLength(0);
    const api = await crearVenta(request, [{ producto: '   ', cantidad: 1, precio_unitario: 1000 }]);
    expect(api).toEqual({ status: 400, cuerpo: { error: 'Fila 1: el nombre del producto es obligatorio' } });
    await captura(page, 'TC-08');
  });

  test('TC-09 Cantidad decimal rechazada en interfaz y API', async ({ page, request }) => {
    await page.goto('/');
    await llenarFilas(page, [{ producto: 'Jugo', cantidad: 1.5, precio: 3000 }]);
    await page.click('button[type=submit]');
    await expect(page.locator('#items .cantidad')).toHaveClass(/invalido/);
    const api = await crearVenta(request, [{ producto: 'Jugo', cantidad: 1.5, precio_unitario: 3000 }]);
    expect(api).toEqual({ status: 400, cuerpo: { error: 'Fila 1: la cantidad debe ser un entero positivo' } });
    await captura(page, 'TC-09');
  });

  test('TC-10 API rechaza una venta sin productos', async ({ page, request }) => {
    const r = await crearVenta(request, []);
    await capturaApi(page, 'TC-10', 'Venta sin productos', [{ paso: 'POST /api/ventas items=[]', datos: r }]);
    expect(r).toEqual({ status: 400, cuerpo: { error: 'Agrega al menos un producto' } });
  });

  test('TC-11 API rechaza items con JSON malformado', async ({ page, request }) => {
    const r = await crearVenta(request, '{producto: Brownie');
    await capturaApi(page, 'TC-11', 'JSON malformado', [{ paso: 'POST /api/ventas items="{producto: Brownie"', datos: r }]);
    expect(r).toEqual({ status: 400, cuerpo: { error: 'Datos inválidos' } });
  });

  test('TC-12 Rechazo de archivo que no es imagen', async ({ page, request }) => {
    const r = await crearVenta(request, [{ producto: 'A', cantidad: 1, precio_unitario: 1 }],
      [{ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('hola') }]);
    await capturaApi(page, 'TC-12', 'Archivo de texto como imagen', [{ paso: 'POST /api/ventas con notas.txt (text/plain)', datos: r }]);
    expect(r).toEqual({ status: 400, cuerpo: { error: 'Solo se permiten imágenes' } });
    expect(await (await request.get('/api/ventas')).json()).toHaveLength(0);
  });

  test('TC-13 Archivo HTML con tipo MIME falsificado como imagen', async ({ page, request }) => {
    const html = '<h1 style="color:red">Página inyectada</h1><script>document.title="XSS";' +
      'document.body.insertAdjacentHTML("beforeend","<p id=xss>Script ejecutado en el origen de la app: "+location.origin+"</p>")</script>';
    const r = await crearVenta(request, [{ producto: 'A', cantidad: 1, precio_unitario: 1 }],
      [{ name: 'recibo.html', mimeType: 'image/png', buffer: Buffer.from(html) }]);
    const ventas = await (await request.get('/api/ventas')).json();
    const url = ventas[0] && ventas[0].imagenes[0];
    let tipo = null;
    if (url) {
      tipo = (await request.get(url)).headers()['content-type'];
      await page.goto(url);
      await captura(page, 'TC-13');
    }
    await evidencia(test.info(), 'respuesta', { creacion: r, archivo: url, contentType: tipo });
    // Esperado: el servidor rechaza el archivo o, como mínimo, nunca lo sirve como HTML ejecutable.
    expect(r.status === 400 || !String(tipo).startsWith('text/html'), `El archivo se guardó como ${url} y se sirve como ${tipo}`).toBe(true);
  });

  test('TC-14 Nombre de producto enviado como número', async ({ page, request }) => {
    const r = await crearVenta(request, [{ producto: 123, cantidad: 1, precio_unitario: 10 }]);
    await capturaApi(page, 'TC-14', 'Producto numérico', [{ paso: 'POST /api/ventas items=[{"producto":123,...}]', datos: r }]);
    // Esperado: guardarlo como "123" (201) o rechazarlo con un mensaje de validación (400), nunca un error interno.
    expect([201, 400], `Respuesta: ${JSON.stringify(r)}`).toContain(r.status);
  });

  test('TC-15 Cantidad escrita en notación científica', async ({ page, request }) => {
    await page.goto('/');
    await llenarFilas(page, [{ producto: 'Chocolatina', cantidad: '1e3', precio: 2000 }]);
    await page.click('button[type=submit]');
    await page.waitForTimeout(500);
    await captura(page, 'TC-15');
    const ventas = await (await request.get('/api/ventas')).json();
    await evidencia(test.info(), 'ventas', ventas);
    // Esperado: "1e3" no es una cantidad entera válida escrita por un vendedor; debe rechazarse.
    expect(ventas, `Se guardó una venta de ${ventas[0] && ventas[0].items[0].cantidad} unidades`).toHaveLength(0);
  });
});
