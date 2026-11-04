// Técnica: pruebas positivas (flujos felices con datos válidos)
const { test, expect, png, crearVenta, llenarFilas, captura } = require('../support/utilidades');

test.describe('Pruebas positivas', () => {
  test('TC-01 Registrar una venta con un producto desde la interfaz @regresion', async ({ page }) => {
    await page.goto('/');
    await llenarFilas(page, [{ producto: 'Brownie', cantidad: 2, precio: 3500 }]);
    await page.click('button[type=submit]');
    await expect(page.locator('#mensaje')).toHaveText('Venta registrada ✔');
    await expect(page.locator('#kpi-total')).toHaveText('$7.000');
    await expect(page.locator('#kpi-trans')).toHaveText('1');
    await expect(page.locator('#historial')).toContainText('Brownie');
    await expect(page.locator('#items .fila')).toHaveCount(1);
    await captura(page, 'TC-01');
  });

  test('TC-02 Registrar una venta con varios productos y total correcto @regresion', async ({ page }) => {
    await page.goto('/');
    await llenarFilas(page, [
      { producto: 'Empanada', cantidad: 3, precio: 2500 },
      { producto: 'Jugo', cantidad: 2, precio: 3000 },
      { producto: 'Brownie', cantidad: 1, precio: 3500 }
    ]);
    await page.click('button[type=submit]');
    await expect(page.locator('#mensaje')).toHaveText('Venta registrada ✔');
    const venta = page.locator('.venta').first();
    await expect(venta.locator('.venta-cab')).toContainText('$17.000');
    await expect(venta.locator('tr')).toHaveCount(4); // encabezado + 3 productos
    await expect(venta).toContainText('$7.500');      // subtotal empanadas
    await captura(page, 'TC-02');
  });

  test('TC-03 Registrar una venta con imagen adjunta', async ({ page, request }) => {
    await page.goto('/');
    await page.setInputFiles('#imagenes', png('recibo.png'));
    await expect(page.locator('#preview img')).toHaveCount(1);
    await llenarFilas(page, [{ producto: 'Galleta', cantidad: 4, precio: 1000 }]);
    await page.click('button[type=submit]');
    await expect(page.locator('#mensaje')).toHaveText('Venta registrada ✔');
    const mini = page.locator('.miniaturas img');
    await expect(mini).toHaveCount(1);
    const src = await mini.getAttribute('src');
    expect((await request.get(src)).status()).toBe(200);
    await captura(page, 'TC-03');
  });

  test('TC-04 El resumen acumula total y transacciones de varias ventas @regresion', async ({ page, request }) => {
    for (const [p, c, pr] of [['Café', 1, 1000], ['Té', 2, 1000], ['Arepa', 1, 3000]])
      expect((await crearVenta(request, [{ producto: p, cantidad: c, precio_unitario: pr }])).status).toBe(201);
    await page.goto('/');
    await expect(page.locator('#kpi-total')).toHaveText('$6.000');
    await expect(page.locator('#kpi-trans')).toHaveText('3');
    await expect(page.locator('.venta')).toHaveCount(3);
    await captura(page, 'TC-04');
  });

  test('TC-05 El top agrupa el mismo producto escrito con distintas mayúsculas @regresion', async ({ page, request }) => {
    await crearVenta(request, [{ producto: 'Brownie', cantidad: 2, precio_unitario: 3500 }]);
    await crearVenta(request, [{ producto: 'brownie', cantidad: 3, precio_unitario: 3500 }]);
    const r = await (await request.get('/api/resumen')).json();
    expect(r.top).toHaveLength(1);
    expect(r.top[0].unidades).toBe(5);
    await page.goto('/');
    await expect(page.locator('#top .barra')).toHaveCount(1);
    await expect(page.locator('#top')).toContainText('5 u');
    await captura(page, 'TC-05');
  });

  test('TC-06 Eliminar una venta con confirmación @regresion', async ({ page, request }) => {
    const { cuerpo } = await crearVenta(request, [{ producto: 'Pizza', cantidad: 1, precio_unitario: 8000 }]);
    await page.goto('/');
    await expect(page.locator('.venta')).toHaveCount(1);
    page.once('dialog', d => { expect(d.message()).toBe(`¿Eliminar la venta #${cuerpo.id}?`); d.accept(); });
    await page.click('.venta-cab .quitar');
    await expect(page.locator('#historial')).toHaveText('Sin transacciones todavía.');
    await expect(page.locator('#kpi-trans')).toHaveText('0');
    await expect(page.locator('#kpi-total')).toHaveText('$0');
    await captura(page, 'TC-06');
  });

  test('TC-07 Leer una imagen con IA llena las filas de productos @regresion', async ({ page }) => {
    await page.goto('/');
    await page.setInputFiles('#imagenes', png('recibo.png'));
    await page.click('#btn-ia');
    await expect(page.locator('#mensaje')).toHaveText('La IA encontró 2 producto(s). Revisa los datos antes de guardar.');
    await expect(page.locator('#items .fila')).toHaveCount(2);
    await expect(page.locator('#items .producto').nth(0)).toHaveValue('Empanada');
    await expect(page.locator('#items .precio').nth(1)).toHaveValue('3000');
    await page.click('button[type=submit]');
    await expect(page.locator('#kpi-total')).toHaveText('$13.500');
    await captura(page, 'TC-07');
  });
});
