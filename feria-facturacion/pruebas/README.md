# Pruebas automáticas · Feria Facturación (Jest + Puppeteer)

Pruebas automáticas de la aplicación **Feria Facturación** con **Puppeteer** (controla Chrome como un usuario real) y **Jest** (ejecuta las pruebas y mide la cobertura de código), con el mismo estilo de los ejercicios de clase (`describe`, `it`, `beforeAll`, `page.click`, `page.type`, `$eval`).

- **55 pruebas** en 6 archivos: **44 aprobadas** (TC-01 a TC-37; TC-17 es una tabla de decisión con 8 filas) y **11 fallidas** (BUG-01 a BUG-11).
- Las 11 fallidas son **defectos reales** de la aplicación: cada prueba comprueba lo que la app debería hacer y falla porque la app no lo hace.
- **Cobertura de código del backend: 97,14 % de líneas**, 88,33 % de ramas y 100 % de funciones. La meta es 80 %.
- La aplicación **no se modifica**: las pruebas viven solo en esta carpeta.

## Requisitos

- **Node.js 22.13 o superior**, porque la app usa el SQLite que trae Node. Verificar con `node -v`.
- Conexión a Internet la primera vez, para que `npm install` descargue Chrome para Puppeteer.

## Instalación (PowerShell, desde la carpeta del repositorio)

```powershell
cd feria-facturacion
npm install        # dependencias de la app (express, multer)
cd pruebas
npm install        # Jest y Puppeteer (descarga Chrome automáticamente)
```

## Ejecución

```powershell
npm test                # las 55 pruebas, sin ventana, con el reporte de cobertura
npm run test:ver        # las mismas pruebas con el navegador visible y más lento (para mostrar en clase)
npm run test:aprobadas  # solo las 44 pruebas de lo que funciona (sin los defectos)
npx jest 06             # solo un archivo (por ejemplo, 06-defectos.test.js)
```

No hace falta ejecutar `npm start`: cada archivo de pruebas arranca la app solo, en el puerto **3200**, y la apaga al terminar.

Resultado esperado de `npm test`: **`Tests: 11 failed, 44 passed, 55 total`** y la tabla de cobertura. Que falle es lo correcto: las 11 fallidas son los defectos de la tabla de abajo, y cada una muestra en la consola el resultado esperado y el obtenido. Por eso `npm test` termina con código de salida 1.

`npm run test:aprobadas` debe terminar con `Tests: 44 passed, 44 total`. Sirve como prueba de regresión: si algún día falla una de estas, se dañó algo que antes funcionaba.

Si la cobertura bajara del 80 %, `npm test` también lo reporta como error (`coverageThreshold` en `jest.config.js`).

**Reporte de cobertura:** abrir `pruebas/coverage/index.html` en el navegador. Muestra cada archivo, el porcentaje y, al hacer clic, las líneas ejecutadas en verde y las no ejecutadas en rojo.

## Casos de prueba por técnica

| Archivo | Técnica | Casos |
| --- | --- | --- |
| `01-registro-ventas.test.js` | Pruebas positivas | TC-01 a TC-06: cargar la página, registrar ventas con uno o varios productos, con imágenes, productos más vendidos y formulario limpio |
| `02-validaciones.test.js` | Negativas, valores límite y tabla de decisión | TC-07 a TC-18: campos vacíos, cantidad 0 o decimal, precio 0 o negativo, mínimos válidos (cantidad 1 y precio 0,01), archivo que no es imagen, servidor caído y la API probada directamente |
| `03-historial-estados.test.js` | Transición de estados | TC-19 a TC-24: sin ventas → con ventas → eliminada, orden del historial, cancelar la eliminación, recargar la página y borrado de imágenes |
| `04-lectura-ia.test.js` | Positivas y negativas de la IA | TC-25 a TC-34: lectura correcta, respuesta en formato markdown, varias imágenes, sin productos, clave inválida, respuesta que no es JSON, falta la clave y formato no soportado |
| `05-dispositivos.test.js` | Compatibilidad | TC-35 a TC-37: iPhone emulado, sin desplazamiento horizontal en celular y ventana de incógnito |
| `06-defectos.test.js` | Pruebas fallidas (defectos) | BUG-01 a BUG-11: ver la tabla de defectos |

## Defectos encontrados (pruebas fallidas)

Todos se reproducen siempre al ejecutar `npm test`. La evidencia de cada uno está en `evidencias/capturas/BUG-xx.png` y en el mensaje de error de la consola.

| ID | Defecto | Esperado | Obtenido | Severidad | Prioridad |
| --- | --- | --- | --- | --- | --- |
| BUG-01 | Se acepta una página HTML disfrazada de imagen | Rechazar el archivo (400) | Se guarda como `.html` y se sirve como página web: permite inyectar código | Crítica | Alta |
| BUG-02 | Doble clic en "Guardar venta" duplica la venta | 1 venta | 2 ventas iguales (el botón no se desactiva mientras guarda) | Alta | Alta |
| BUG-03 | Un nombre de producto numérico produce error interno | Guardar o rechazar (201 / 400) | 500 "No se pudo guardar la venta" | Media | Alta |
| BUG-04 | Un precio enorme (1e308) daña el resumen | Rechazarlo o calcular bien | Total `null`: el resumen dice "$0" con 1 transacción | Media | Media |
| BUG-05 | El error de la IA sale en inglés técnico | Mensaje en español que diga qué hacer | "invalid x-api-key" | Media | Media |
| BUG-06 | Subir más de 10 imágenes da un mensaje en inglés | "Máximo 10 imágenes por venta" | "Unexpected file field" | Baja | Media |
| BUG-07 | Una imagen de más de 8 MB da un mensaje en inglés | "La imagen supera los 8 MB" | "File too large" | Baja | Media |
| BUG-08 | "Café" y "CAFÉ" aparecen como productos distintos en el top | 1 producto | 2 productos (SQLite no pasa a minúscula las letras con tilde) | Baja | Baja |
| BUG-09 | Un precio de 0,001 se acepta y el total muestra $0 | Rechazarlo o mostrarlo | Venta guardada y total "$0" | Baja | Baja |
| BUG-10 | Un nombre de producto muy largo desborda la página | El texto se ajusta | La página se desplaza 4 285 px en horizontal | Baja | Baja |
| BUG-11 | Eliminar una venta que no existe responde "ok" | 404 "Venta no encontrada" | 200 `{"ok": true}` | Baja | Baja |

Severidad = qué tan grave es el daño. Prioridad = qué tan pronto hay que corregirlo.

## Cobertura: qué se mide y cómo se obtuvo

- **Tipo:** cobertura de **código** (líneas, sentencias, ramas y funciones) del **backend**: `server.js` y `database/db.js`.
- **Herramienta:** Jest con `coverageProvider: 'v8'`. El motor V8 de Node cuenta qué líneas se ejecutaron mientras corrían las pruebas.
- **Cómo funciona:** cada archivo de pruebas arranca `server.js` **dentro del mismo proceso de Jest** (`soporte/utilidades.js` → `iniciarServidor`). Puppeteer usa la página como un usuario y la página llama a la API. Así Jest ve qué partes del servidor se ejecutaron.
- **Qué no se mide:** `public/js/app.js`, porque corre dentro de Chrome y no en el proceso de Jest. Ese código sí se prueba, pero su cobertura no aparece en este reporte.
- **Líneas sin cubrir y por qué:**
  - `server.js` 10-11: lectura del archivo `.env`. Las pruebas pasan la clave por variable de entorno.
  - `db.js` 12-14: el respaldo con `better-sqlite3` para Node 18/20. Con Node 22 nunca se usa.
- Con `npm run test:aprobadas` (sin los defectos) la cobertura es 94,85 %: también supera el 80 %. La diferencia es el `ROLLBACK` de `server.js` (líneas 70-73), que solo se ejecuta con el BUG-03.

> La cobertura de código no es lo mismo que la cobertura de casos de prueba (cuántos casos diseñados se ejecutaron) ni que la cobertura de funcionalidades (qué funciones de la app tienen pruebas). Aquí se reporta la de código.

## Detalles técnicos

- **Base de datos:** antes de empezar se guarda una copia de `database/feria.db` y al terminar se restaura (`soporte/antes-de-todo.js` y `soporte/despues-de-todo.js`). Cada prueba empieza con la base vacía. Las imágenes que suben las pruebas a `uploads/` se borran al final.
- **IA simulada:** la app llama a la API de Anthropic para leer imágenes. `simularIA()` reemplaza `fetch` **solo para esa dirección** y devuelve respuestas fijas. Así se prueba cómo responde la app a cada caso, sin Internet ni clave real.
- **Archivos de prueba:** `archivos/` tiene dos imágenes, un `.txt` (para el caso "no es imagen") y un `.bmp` (formato que la IA no acepta).
- **Diálogos:** `abrirApp()` acepta automáticamente los `confirm()`, como en clase. Con `{ aceptarDialogos: false }` los cancela.
- **Evidencias:** al terminar cada prueba, `guardarEvidencia()` toma una captura de la página completa con el nombre del caso.

## Estructura

```
pruebas/
├── package.json                 # Jest 29.7.0 y Puppeteer 24.43.1
├── jest.config.js               # configuración y umbral de cobertura (80 %)
├── 01-registro-ventas.test.js
├── 02-validaciones.test.js
├── 03-historial-estados.test.js
├── 04-lectura-ia.test.js
├── 05-dispositivos.test.js
├── 06-defectos.test.js          # las 11 pruebas que fallan por defectos reales
├── soporte/
│   ├── utilidades.js            # arrancar el servidor, abrir Chrome, llenar el formulario, IA simulada
│   ├── antes-de-todo.js         # respaldo de la base de datos
│   └── despues-de-todo.js       # restauración y limpieza
├── archivos/                    # imágenes y archivos de prueba
├── evidencias/                  # salida de npm test, capturas del reporte de cobertura
│   └── capturas/                # una captura por caso al terminar cada prueba (TC-01.png, BUG-01.png...)
└── coverage/                    # reporte de cobertura (se genera con npm test)
```

## Solución de problemas

- **`Could not find Chrome`**: ejecutar `npx puppeteer browsers install chrome` dentro de `pruebas`.
- **`EADDRINUSE` en el puerto 3200**: otro programa usa ese puerto. Cerrarlo, o cambiar `PUERTO` en `soporte/utilidades.js`.
- **`Cannot find module 'node:sqlite'` o `better-sqlite3`**: la versión de Node es menor a 22.13. Actualizar Node.
- **Aviso `ExperimentalWarning: SQLite is an experimental feature`**: es normal, lo imprime Node y no afecta las pruebas.
