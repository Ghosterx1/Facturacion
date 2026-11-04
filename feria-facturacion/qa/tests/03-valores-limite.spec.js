// Técnica: análisis de valores límite
const { test, expect, png, archivoDeTamano, crearVenta, llenarFilas, captura, capturaApi } = require('../support/utilidades');
const fila = (extra = {}) => [{ producto: 'Producto', cantidad: 1, precio_unitario: 1000, ...extra }];

test.describe('Valores límite', () => {
  test('TC-16 Cantidad en el límite inferior (0 rechaza, 1 acepta) @regresion', async ({ page, request }) => {
    const cero = await crearVenta(request, fila({ cantidad: 0 }));
    const uno = await crearVenta(request, fila({ cantidad: 1 }));
    const neg = await crearVenta(request, fila({ cantidad: -1 }));
    await capturaApi(page, 'TC-16', 'Límite inferior de cantidad', [
      { paso: 'cantidad = 0', datos: cero }, { paso: 'cantidad = 1', datos: uno }, { paso: 'cantidad = -1', datos: neg }]);
    expect(cero.status).toBe(400);
    expect(uno.status).toBe(201);
    expect(neg.status).toBe(400);
  });

  test('TC-17 Precio en el límite inferior (0 rechaza, 0,01 acepta)', async ({ page, request }) => {
    const cero = await crearVenta(request, fila({ precio_unitario: 0 }));
    const centavo = await crearVenta(request, fila({ precio_unitario: 0.01 }));
    const neg = await crearVenta(request, fila({ precio_unitario: -0.01 }));
    await capturaApi(page, 'TC-17', 'Límite inferior de precio', [
      { paso: 'precio = 0', datos: cero }, { paso: 'precio = 0.01', datos: centavo }, { paso: 'precio = -0.01', datos: neg }]);
    expect(cero).toEqual({ status: 400, cuerpo: { error: 'Fila 1: el precio debe ser mayor a cero' } });
    expect(centavo.status).toBe(201);
    expect(neg.status).toBe(400);
  });

  test('TC-18 Precio por debajo de la precisión de la moneda (0,001)', async ({ page }) => {
    await page.goto('/');
    await llenarFilas(page, [{ producto: 'Chicle', cantidad: 1, precio: 0.001 }]);
    await page.click('button[type=submit]');
    await page.waitForTimeout(500);
    await captura(page, 'TC-18');
    const guardada = (await page.locator('#mensaje').textContent()) === 'Venta registrada ✔';
    const total = await page.locator('#kpi-total').textContent();
    // Esperado: si el precio es aceptado como > 0, el total mostrado no puede ser $0.
    expect(!guardada || total !== '$0', `Venta guardada con precio 0,001 y el total mostrado es ${total}`).toBe(true);
  });

  test('TC-19 Número de imágenes: 10 acepta, 11 rechaza con mensaje claro', async ({ page, request }) => {
    const diez = await crearVenta(request, fila(), Array.from({ length: 10 }, (_, i) => png(`img${i}.png`)));
    const once = await crearVenta(request, fila(), Array.from({ length: 11 }, (_, i) => png(`img${i}.png`)));
    await capturaApi(page, 'TC-19', 'Límite de 10 imágenes', [{ paso: '10 imágenes', datos: diez }, { paso: '11 imágenes', datos: once }]);
    expect(diez.status).toBe(201);
    expect(once.status).toBe(400);
    expect(once.cuerpo.error, 'El mensaje debe estar en español y explicar el límite').toMatch(/imágenes|máximo|10/i);
  });

  test('TC-20 Tamaño de imagen: 8 MB acepta, 8 MB + 1 byte rechaza con mensaje claro', async ({ page, request }) => {
    const ocho = await crearVenta(request, fila(), [archivoDeTamano(8 * 1024 * 1024)]);
    const mas = await crearVenta(request, fila(), [archivoDeTamano(8 * 1024 * 1024 + 1)]);
    await capturaApi(page, 'TC-20', 'Límite de 8 MB por imagen', [{ paso: '8 388 608 bytes', datos: ocho }, { paso: '8 388 609 bytes', datos: mas }]);
    expect(ocho.status).toBe(201);
    expect(mas.status).toBe(400);
    expect(mas.cuerpo.error, 'El mensaje debe estar en español y explicar el límite').toMatch(/tamaño|MB|grande|pesad/i);
  });

  test('TC-21 Precio en el máximo numérico (1e308) no debe dañar el resumen', async ({ page, request }) => {
    await crearVenta(request, [{ producto: 'Brownie', cantidad: 2, precio_unitario: 3500 }]);
    const r = await crearVenta(request, [{ producto: 'Error de digitación', cantidad: 2, precio_unitario: 1e308 }]);
    const resumen = await (await request.get('/api/resumen')).json();
    await page.goto('/');
    await captura(page, 'TC-21');
    const kpi = await page.locator('#kpi-total').textContent();
    // Esperado: rechazar el monto (400) o mantener un total numérico coherente.
    expect(r.status === 400 || (typeof resumen.total === 'number' && kpi !== '$0'),
      `Venta aceptada (${r.status}); resumen.total=${resumen.total}; KPI muestra ${kpi} con ${resumen.transacciones} transacciones`).toBe(true);
  });

  test('TC-22 El top muestra máximo 5 productos', async ({ page, request }) => {
    const productos = ['A', 'B', 'C', 'D', 'E', 'F'];
    await crearVenta(request, productos.map((p, i) => ({ producto: p, cantidad: i + 1, precio_unitario: 100 })));
    const r = await (await request.get('/api/resumen')).json();
    expect(r.top.map(t => t.producto)).toEqual(['F', 'E', 'D', 'C', 'B']);
    await page.goto('/');
    await expect(page.locator('#top .barra')).toHaveCount(5);
    await captura(page, 'TC-22');
  });

  test('TC-23 Nombre de producto de 5000 caracteres', async ({ page, request }) => {
    const r = await crearVenta(request, [{ producto: 'A'.repeat(5000), cantidad: 1, precio_unitario: 1000 }]);
    await page.goto('/');
    await page.waitForSelector('.venta');
    const desborde = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await captura(page, 'TC-23');
    // Esperado: limitar la longitud del nombre (400) o mostrarlo sin desbordar la página.
    expect(r.status === 400 || desborde <= 0, `Guardado (${r.status}); la página se desborda ${desborde}px en horizontal`).toBe(true);
  });
});
