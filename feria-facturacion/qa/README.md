# Auditoría QA · Feria Facturación

Suite de pruebas de la auditoría de calidad (Electiva Testing y QA).
Equipo: **Marcos Martínez** y **Santiago Mattos**.

- Herramienta de automatización: **Playwright** (`@playwright/test` 1.56.1), interfaz y API.
- Cobertura de código del backend: **c8** 10.1.3 (cobertura nativa de V8).
- La aplicación **no se modifica**: el servidor se arranca a través de `support/servidor-pruebas.js`.

## Requisitos

- Node.js **22.13 o superior** (la app usa `node:sqlite`). Verificar con `node -v`.
- Git.

## Instalación

Desde la raíz del repositorio:

```bash
cd feria-facturacion
npm install            # dependencias de la aplicación (express, multer)
cd qa
npm install            # Playwright y c8
npx playwright install chromium
```

## Ejecución

```bash
# Dentro de feria-facturacion/qa
npm test                 # los 30 casos (TC-01 a TC-30)
npm run test:regresion   # solo la suite de regresión automatizada (10 casos con @regresion)
npm run reporte          # abre el reporte HTML de Playwright
```

Playwright levanta solo el servidor en `http://localhost:3100` (con c8) y lo cierra al terminar.
No hace falta ejecutar `npm start` aparte. Los puertos 3100 (app) y 3199 (control de apagado) deben estar libres.

> Resultado esperado de `npm test`: **19 aprobados y 11 fallidos**. Los 11 fallos son los defectos
> reportados en la auditoría (BUG-01 a BUG-10); cada caso fallido muestra en el reporte el motivo.
> `npm run test:regresion` debe terminar con **10 aprobados**.

## Dónde quedan los resultados

| Ruta | Contenido |
| --- | --- |
| `reportes/playwright/index.html` | Reporte HTML: estado de cada caso, capturas, adjuntos JSON, video y trace de los fallidos |
| `reportes/resultados.json` | Resultados en JSON |
| `reportes/cobertura/index.html` | Reporte de cobertura de código (líneas, ramas, funciones) de `server.js` y `database/db.js` |
| `reportes/cobertura/coverage-summary.json` | Resumen de cobertura en JSON |
| `evidencias/TC-xx.png` | Captura de evidencia de cada caso |

## Estructura

```
qa/
├── playwright.config.js        # configuración: servidor con c8, reportes, capturas
├── support/
│   ├── servidor-pruebas.js     # arranque controlado de la app + doble de prueba de la API de IA
│   ├── teardown.js             # apagado ordenado al final para que c8 escriba la cobertura (necesario en Windows)
│   └── utilidades.js           # helpers: crear ventas, imágenes de prueba, evidencias
└── tests/
    ├── 01-positivas.spec.js          TC-01 a TC-07
    ├── 02-negativas.spec.js          TC-08 a TC-15
    ├── 03-valores-limite.spec.js     TC-16 a TC-23
    ├── 04-tablas-decision.spec.js    TC-24 a TC-26
    └── 05-transicion-estados.spec.js TC-27 a TC-30
```

## Doble de prueba de la IA

La app llama a `https://api.anthropic.com/v1/messages`. Como no se cuenta con una API key válida,
`servidor-pruebas.js` reemplaza `fetch` **solo para esa URL** y devuelve respuestas fijas según un
marcador de texto dentro de la imagen enviada (`IA_ERROR_CLAVE`, `IA_BASURA`, `IA_VACIO`, `IA_LENTO`).
La respuesta de error de clave reproduce exactamente la que da la API real con la clave `alpha123`
del `.env.example` (verificado manualmente: HTTP 502 con `invalid x-api-key`).
Con esto se prueba el manejo de respuestas de la app, no la precisión del modelo de IA.

## Notas

- Cada caso empieza con la base de datos vacía (fixture automático). Se ejecutan en serie (`workers: 1`).
- Si Playwright no puede descargar Chromium, se puede usar un Chrome instalado:
  `CHROME_PATH="/ruta/a/chrome" npm test`.
