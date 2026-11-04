// Técnica: tablas de decisión
const { spawn } = require('child_process');
const path = require('path');
const { test, expect, png, crearVenta, leerImagen, capturaApi } = require('../support/utilidades');

test.describe('Tablas de decisión', () => {
  test('TC-24 Validación de una fila: producto × cantidad × precio @regresion', async ({ page, request }) => {
    const V = { producto: 'Brownie', cantidad: 2, precio_unitario: 3500 };
    const I = { producto: '', cantidad: 0, precio_unitario: 0 };
    const reglas = [];
    for (const p of [1, 0]) for (const c of [1, 0]) for (const pr of [1, 0]) {
      const item = { producto: (p ? V : I).producto, cantidad: (c ? V : I).cantidad, precio_unitario: (pr ? V : I).precio_unitario };
      const esperado = !p ? 'Fila 1: el nombre del producto es obligatorio'
        : !c ? 'Fila 1: la cantidad debe ser un entero positivo'
        : !pr ? 'Fila 1: el precio debe ser mayor a cero' : null;
      const r = await crearVenta(request, [item]);
      reglas.push({ regla: `P=${p ? 'V' : 'I'} C=${c ? 'V' : 'I'} PR=${pr ? 'V' : 'I'}`, status: r.status, cuerpo: r.cuerpo, esperado: esperado || '201 creada' });
      if (esperado) expect(r, reglas.at(-1).regla).toEqual({ status: 400, cuerpo: { error: esperado } });
      else expect(r.status).toBe(201);
    }
    await capturaApi(page, 'TC-24', 'Tabla de decisión de validación', [{ paso: '8 reglas', datos: reglas }]);
    expect(await (await request.get('/api/ventas')).json()).toHaveLength(1);
  });

  test('TC-25 Lectura con IA: clave × imagen × formato × respuesta', async ({ page, request }) => {
    test.setTimeout(60_000);
    const reglas = [];
    const verificar = async (regla, r, esperado) => { reglas.push({ regla, obtenido: r, esperado }); };

    await verificar('R1 con clave, sin imagen', await leerImagen(request, null), '400 No se recibió ninguna imagen');
    await verificar('R2 con clave, formato BMP', await leerImagen(request, { ...png('foto.bmp'), mimeType: 'image/bmp' }), '400 Formato no soportado');
    await verificar('R3 con clave, PNG legible', await leerImagen(request, png()), '200 con 2 productos');
    await verificar('R4 con clave, IA responde texto no JSON', await leerImagen(request, png('x.png', 'IA_BASURA')), '500 mensaje para ingresar manualmente');
    await verificar('R5 clave inválida (alpha123 del .env.example)', await leerImagen(request, png('x.png', 'IA_ERROR_CLAVE')), '4xx/5xx con mensaje en español que oriente al usuario');

    // R6: sin clave configurada. Se levanta una instancia aparte de la app sin ANTHROPIC_API_KEY.
    const app = path.join(__dirname, '..', '..');
    const env = { ...process.env, PORT: '3101' }; delete env.ANTHROPIC_API_KEY;
    const hijo = spawn(process.execPath, ['server.js'], { cwd: app, env, stdio: 'ignore' });
    try {
      let r6;
      for (let i = 0; i < 40 && !r6; i++) {
        try {
          const form = new FormData(); form.append('imagen', new Blob([png().buffer], { type: 'image/png' }), 'x.png');
          const resp = await request.post('http://localhost:3101/api/leer-imagen', { multipart: form });
          r6 = { status: resp.status(), cuerpo: await resp.json() };
        } catch { await new Promise(res => setTimeout(res, 250)); }
      }
      await verificar('R6 sin clave', r6, '501 Falta ANTHROPIC_API_KEY');
    } finally { hijo.kill(); }

    await capturaApi(page, 'TC-25', 'Tabla de decisión de lectura con IA', [{ paso: '6 reglas', datos: reglas }]);
    const [r1, r2, r3, r4, r5, r6] = reglas.map(x => x.obtenido);
    expect(r1).toEqual({ status: 400, cuerpo: { error: 'No se recibió ninguna imagen' } });
    expect(r2.status).toBe(400);
    expect(r3.status).toBe(200);
    expect(r3.cuerpo.items).toHaveLength(2);
    expect(r4).toEqual({ status: 500, cuerpo: { error: 'No se pudo interpretar la imagen. Ingresa los datos manualmente.' } });
    expect(r6.status).toBe(501);
    expect(r5.cuerpo.error, 'R5: el usuario recibe el mensaje técnico en inglés de la API externa').toMatch(/clave|manual/i);
  });

  test('TC-26 Agrupación del top: mayúsculas ASCII y letras acentuadas', async ({ page, request }) => {
    const reglas = [];
    for (const [grupo, nombres] of [['ASCII', ['Brownie', 'brownie', 'BROWNIE']], ['Acentos', ['Café', 'café', 'CAFÉ']]]) {
      for (const n of nombres) await crearVenta(request, [{ producto: n, cantidad: 1, precio_unitario: 1000 }]);
      const top = (await (await request.get('/api/resumen')).json()).top;
      reglas.push({ grupo, nombres, top: top.map(t => `${t.producto}: ${t.unidades} u`) });
      await request.get('/api/ventas').then(r => r.json()).then(vs => Promise.all(vs.map(v => request.delete(`/api/ventas/${v.id}`))));
    }
    await capturaApi(page, 'TC-26', 'Tabla de decisión de agrupación del top', [{ paso: 'Resultado por grupo', datos: reglas }]);
    expect(reglas[0].top).toHaveLength(1);
    expect(reglas[1].top, '"Café", "café" y "CAFÉ" deben contar como un solo producto').toHaveLength(1);
  });
});
