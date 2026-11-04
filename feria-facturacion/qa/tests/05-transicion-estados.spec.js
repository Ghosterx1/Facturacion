// Técnica: transición de estados
const { test, expect, png, crearVenta, llenarFilas, captura, capturaApi } = require('../support/utilidades');

test.describe('Transición de estados', () => {
  test('TC-27 Estados del formulario: filas, guardado y reinicio @regresion', async ({ page }) => {
    await page.goto('/');
    const filas = page.locator('#items .fila');
    await expect(filas).toHaveCount(1);                       // E0: una fila vacía
    await page.click('#btn-agregar'); await page.click('#btn-agregar');
    await expect(filas).toHaveCount(3);                       // E1: varias filas
    await filas.nth(2).locator('.quitar').click();
    await filas.nth(1).locator('.quitar').click();
    await expect(filas).toHaveCount(1);
    await filas.nth(0).locator('.quitar').click();            // no se puede quedar sin filas
    await expect(filas).toHaveCount(1);
    await llenarFilas(page, [{ producto: 'Té', cantidad: 1, precio: 2000 }]);
    await page.setInputFiles('#imagenes', png());
    await page.click('button[type=submit]');                  // E2: guardada
    await expect(page.locator('#mensaje')).toHaveText('Venta registrada ✔');
    await expect(filas).toHaveCount(1);                       // E0 otra vez: formulario reiniciado
    await expect(filas.nth(0).locator('.producto')).toHaveValue('');
    await expect(page.locator('#preview img')).toHaveCount(0);
    await captura(page, 'TC-27');
  });

  test('TC-28 Ciclo de vida de una venta: inexistente → registrada → eliminada', async ({ page, request }) => {
    const pasos = [];
    const registro = async (paso, r) => { pasos.push({ paso, datos: r }); return r; };
    const { cuerpo } = await registro('Registrar', await crearVenta(request, [{ producto: 'Arepa', cantidad: 1, precio_unitario: 3000 }]));
    const lista1 = await registro('Listar', (await (await request.get('/api/ventas')).json()).map(v => v.id));
    const del1 = await request.delete(`/api/ventas/${cuerpo.id}`);
    await registro('Eliminar (1.ª vez)', { status: del1.status(), cuerpo: await del1.json() });
    const lista2 = await registro('Listar', (await (await request.get('/api/ventas')).json()).map(v => v.id));
    const del2 = await request.delete(`/api/ventas/${cuerpo.id}`);
    const r2 = await registro('Eliminar (2.ª vez, ya no existe)', { status: del2.status(), cuerpo: await del2.json() });
    const del3 = await request.delete('/api/ventas/abc');
    const r3 = await registro('Eliminar id no numérico "abc"', { status: del3.status(), cuerpo: await del3.json() });
    await capturaApi(page, 'TC-28', 'Ciclo de vida de una venta', pasos);
    expect(lista1).toContain(cuerpo.id);
    expect(del1.status()).toBe(200);
    expect(lista2).not.toContain(cuerpo.id);
    expect(r2.status, 'Eliminar una venta que ya no existe debe responder 404').toBe(404);
    expect([400, 404]).toContain(r3.status);
  });

  test('TC-29 Estados del botón de IA: habilitado → leyendo → habilitado', async ({ page }) => {
    await page.goto('/');
    const btn = page.locator('#btn-ia');
    await expect(btn).toBeEnabled();
    await btn.click();                                         // sin imágenes: no cambia de estado
    await expect(page.locator('#mensaje')).toHaveText('Primero selecciona al menos una imagen.');
    await page.setInputFiles('#imagenes', png('lento.png', 'IA_LENTO'));
    await btn.click();
    await expect(btn).toBeDisabled();                          // leyendo
    await expect(page.locator('#mensaje')).toHaveText('Leyendo imagen 1 de 1 con IA...');
    await captura(page, 'TC-29-leyendo');
    await expect(btn).toBeEnabled({ timeout: 5000 });          // terminado
    await expect(page.locator('#mensaje')).toHaveClass(/ok/);
    await page.setInputFiles('#imagenes', png('vacio.png', 'IA_VACIO'));
    await btn.click();
    await expect(page.locator('#mensaje')).toHaveText('La IA no encontró productos legibles. Ingrésalos manualmente.');
    await expect(btn).toBeEnabled();
    await captura(page, 'TC-29');
  });

  test('TC-30 Estado de un campo: inválido → corregido → venta guardada @regresion', async ({ page }) => {
    await page.goto('/');
    await llenarFilas(page, [{ producto: 'Limonada', cantidad: 2, precio: 0 }]);
    await page.click('button[type=submit]');
    const precio = page.locator('#items .precio');
    await expect(precio).toHaveClass(/invalido/);
    await expect(page.locator('#mensaje')).toHaveClass(/error/);
    await captura(page, 'TC-30-invalido');
    await precio.fill('2500');
    await page.click('button[type=submit]');
    await expect(page.locator('#mensaje')).toHaveText('Venta registrada ✔');
    await expect(page.locator('#items .precio')).not.toHaveClass(/invalido/);
    await expect(page.locator('#kpi-total')).toHaveText('$5.000');
    await captura(page, 'TC-30');
  });
});
