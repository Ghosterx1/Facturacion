// Configuración de la suite de auditoría.
// El servidor de la app se levanta con c8 para medir cobertura de código del backend.
const { defineConfig, devices } = require('@playwright/test');
const path = require('path');

const PUERTO = 3100;
const c8 = path.join(__dirname, 'node_modules', '.bin', 'c8');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,                       // la app usa un único archivo SQLite: ejecución en serie
  timeout: 30_000,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reportes/playwright', open: 'never' }],
    ['json', { outputFile: 'reportes/resultados.json' }]
  ],
  outputDir: 'reportes/artefactos',
  globalTeardown: require.resolve('./support/teardown.js'),
  use: {
    baseURL: `http://localhost:${PUERTO}`,
    screenshot: 'on',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}
  },
  webServer: {
    cwd: path.join(__dirname, '..'),
    command: `"${c8}" --reports-dir qa/reportes/cobertura --reporter=html --reporter=text --reporter=json-summary --include server.js --include "database/**" node qa/support/servidor-pruebas.js`,
    url: `http://localhost:${PUERTO}/api/resumen`,
    env: { PORT: String(PUERTO) },
    reuseExistingServer: false,
    stdout: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }
  }
});
