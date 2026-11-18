// Configuración de Jest (igual idea que el jest.config.ts del proyecto Angular de clase).
//
// La app (server.js) se arranca DENTRO del proceso de Jest, por eso Jest puede medir
// qué líneas del backend se ejecutaron mientras Puppeteer usaba la página.
module.exports = {
  // La raíz es la carpeta de la app (feria-facturacion), para poder medir server.js
  rootDir: '..',
  // Las pruebas solo se buscan en la carpeta "pruebas"
  testMatch: ['<rootDir>/pruebas/**/*.test.js'],
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/qa/'],
  modulePathIgnorePatterns: ['<rootDir>/qa/'],
  testEnvironment: 'node',

  // Cada prueba abre un navegador: les damos hasta 30 segundos
  testTimeout: 30000,
  // Una prueba a la vez (comparten la misma base de datos y el mismo puerto)
  maxWorkers: 1,

  // Respaldo de la base de datos real antes de empezar y restauración al terminar
  globalSetup: '<rootDir>/pruebas/soporte/antes-de-todo.js',
  globalTeardown: '<rootDir>/pruebas/soporte/despues-de-todo.js',

  // ---------- Cobertura de código (coverage) ----------
  collectCoverage: true,
  // V8 = el motor de JavaScript de Node cuenta qué líneas se ejecutaron (no hay que modificar la app)
  coverageProvider: 'v8',
  // Qué archivos se miden: el backend de la aplicación
  collectCoverageFrom: ['server.js', 'database/**/*.js'],
  coverageReporters: ['html', 'text', 'text-summary'],
  coverageDirectory: '<rootDir>/pruebas/coverage',
  // Si la cobertura baja del 80 %, "npm test" falla
  coverageThreshold: {
    global: { statements: 80, branches: 80, functions: 80, lines: 80 },
  },
}
